/**
 * 跨機關隔離自動化測試(E2):
 *   BASE_URL=http://127.0.0.1:3001 npm run test:isolation
 *
 * 驗證多租戶最關鍵的安全性質:
 *   1. A 機關帳號絕對碰不到 B 機關的週期/檢核表/缺失/匯出
 *   2. 未指派的稽核委員碰不到任何週期(API 與頁面)
 *   3. 非最高管理員打 /api/admin/* 一律 403
 *   4. 未登入一律 401(API)
 * 作法:以 Prisma 建立 isotest- 前綴的臨時夾具 → 走真實 NextAuth 登入
 * 取 session → 對真實 API/頁面打請求斷言狀態碼 → 全數清理。
 * 任何 FAIL 以非零退出碼結束(可掛 CI)。
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3001';
const PW = 'IsoTest#2026';

// ── HTTP helpers ─────────────────────────────

type Jar = Map<string, string>;

function absorb(jar: Jar, headers: Headers) {
  const setCookies: string[] =
    typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [];
  for (const sc of setCookies) {
    const pair = sc.split(';')[0];
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1));
  }
}

function cookieHeader(jar: Jar): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function login(email: string): Promise<Jar> {
  const jar: Jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  absorb(jar, csrfRes.headers);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cookieHeader(jar),
    },
    body: new URLSearchParams({ csrfToken, email, password: PW, json: 'true' }),
  });
  absorb(jar, res.headers);
  const hasSession = Array.from(jar.keys()).some((k) => k.includes('session-token'));
  if (!hasSession) throw new Error(`登入失敗:${email}(status ${res.status})`);
  return jar;
}

// ── 斷言框架 ─────────────────────────────────

let passCount = 0;
const failures: string[] = [];

async function request(
  jar: Jar | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<number> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(jar ? { cookie: cookieHeader(jar) } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.status;
}

async function expectStatus(
  name: string,
  jar: Jar | null,
  method: string,
  path: string,
  want: number[],
  body?: unknown,
) {
  const got = await request(jar, method, path, body);
  if (want.includes(got)) {
    passCount++;
    console.log(`  [PASS] ${name} (${got})`);
  } else {
    failures.push(`${name}: 預期 ${want.join('/')},得到 ${got}`);
    console.log(`  [FAIL] ${name} — 預期 ${want.join('/')},得到 ${got}`);
  }
}

/** 陽性對照:只要不是被擋(401/403/404/30x)就算通過 — 證明測試帳號與路徑有效。 */
async function expectAllowed(name: string, jar: Jar, method: string, path: string, body?: unknown) {
  const got = await request(jar, method, path, body);
  const blocked = [401, 403, 404, 302, 303, 307, 308].includes(got);
  if (!blocked) {
    passCount++;
    console.log(`  [PASS] ${name} (${got})`);
  } else {
    failures.push(`${name}: 應放行卻被擋(${got})`);
    console.log(`  [FAIL] ${name} — 應放行卻被擋(${got})`);
  }
}

const REDIRECTED = [302, 303, 307, 308];

// ── 夾具 ─────────────────────────────────────

async function cleanup() {
  const orgs = await prisma.organization.findMany({
    where: { code: { startsWith: 'ISOTEST-' } },
    select: { id: true },
  });
  const orgIds = orgs.map((o) => o.id);
  const cycles = await prisma.auditCycle.findMany({
    where: { organizationId: { in: orgIds } },
    select: { id: true },
  });
  const cycleIds = cycles.map((c) => c.id);

  await prisma.checklistResponse.deleteMany({ where: { cycleId: { in: cycleIds } } });
  const defs = await prisma.deficiency.findMany({ where: { cycleId: { in: cycleIds } }, select: { id: true } });
  await prisma.correctiveAction.deleteMany({ where: { deficiencyId: { in: defs.map((d) => d.id) } } });
  await prisma.deficiency.deleteMany({ where: { cycleId: { in: cycleIds } } });
  await prisma.auditorAssignment.deleteMany({ where: { cycleId: { in: cycleIds } } });
  await prisma.prepRequirement.deleteMany({ where: { cycleId: { in: cycleIds } } });
  await prisma.cycleStateTransition.deleteMany({ where: { cycleId: { in: cycleIds } } }).catch(() => {});
  await prisma.signedReport.deleteMany({ where: { cycleId: { in: cycleIds } } }).catch(() => {});
  await prisma.auditCycle.deleteMany({ where: { id: { in: cycleIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'isotest-' } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
}

async function main() {
  console.log(`[isolation] target: ${BASE}`);

  // 前置:要有含題目的檢核表版本(取第一題供填報測試)
  const version = await prisma.checklistVersion.findFirst({
    where: { items: { some: {} } },
    include: { items: { orderBy: { orderIndex: 'asc' }, take: 1 } },
    orderBy: { year: 'desc' },
  });
  if (!version) throw new Error('資料庫沒有任何含題目的檢核表版本,無法測試');
  const firstItemNo = version.items[0].itemNo;

  console.log('[isolation] 清理舊夾具…');
  await cleanup();

  console.log('[isolation] 建立夾具(2 機關、4 帳號、2 週期、1 缺失)…');
  const hash = await bcrypt.hash(PW, 10);
  const orgA = await prisma.organization.create({
    data: { code: 'ISOTEST-A', name: '隔離測試甲醫院', shortName: '測甲' },
  });
  const orgB = await prisma.organization.create({
    data: { code: 'ISOTEST-B', name: '隔離測試乙醫院', shortName: '測乙' },
  });
  const [adminA, adminB, auditorX, auditorY] = await Promise.all([
    prisma.user.create({ data: { email: 'isotest-orga@test.local', name: '甲機關管理員', passwordHash: hash, role: 'ORG_ADMIN', organizationId: orgA.id, isActive: true } }),
    prisma.user.create({ data: { email: 'isotest-orgb@test.local', name: '乙機關管理員', passwordHash: hash, role: 'ORG_ADMIN', organizationId: orgB.id, isActive: true } }),
    prisma.user.create({ data: { email: 'isotest-auditor-x@test.local', name: '未指派委員X', passwordHash: hash, role: 'AUDITOR', isActive: true } }),
    prisma.user.create({ data: { email: 'isotest-auditor-y@test.local', name: '指派委員Y', passwordHash: hash, role: 'AUDITOR', isActive: true } }),
  ]);
  const now = new Date();
  const in30d = new Date(now.getTime() + 30 * 86400000);
  const cycleA = await prisma.auditCycle.create({
    data: { year: 2099, organizationId: orgA.id, checklistVersionId: version.id, status: 'PREPARATION', startDate: now, dueDate: in30d },
  });
  const cycleB = await prisma.auditCycle.create({
    data: { year: 2099, organizationId: orgB.id, checklistVersionId: version.id, status: 'PREPARATION', startDate: now, dueDate: in30d },
  });
  await prisma.auditorAssignment.create({ data: { cycleId: cycleA.id, auditorId: auditorY.id } });
  const defA = await prisma.deficiency.create({
    data: { cycleId: cycleA.id, aspect: 'STRATEGY', type: 'IMPROVE', itemNo: 999, description: '隔離測試用缺失', createdById: adminA.id },
  });

  console.log('[isolation] 登入 4 個測試帳號…');
  const [jarA, jarB, jarX, jarY] = await Promise.all([
    login(adminA.email), login(adminB.email), login(auditorX.email), login(auditorY.email),
  ]);

  const itemPath = (cid: string) =>
    `/api/cycles/${cid}/checklist/${encodeURIComponent(firstItemNo)}`;
  const putBody = { compliance: 'COMPLIANT', description: '隔離測試', recordDocs: null, version: 0 };

  console.log('\n── 陽性對照(測試方法有效性)──');
  await expectAllowed('A管理員 匯出自家檢核表', jarA, 'GET', `/api/cycles/${cycleA.id}/export/checklist`);
  await expectAllowed('A管理員 填自家檢核表', jarA, 'PUT', itemPath(cycleA.id), putBody);
  await expectAllowed('指派委員Y 匯出A檢核表', jarY, 'GET', `/api/cycles/${cycleA.id}/export/checklist`);

  console.log('\n── 跨機關隔離(B 帳號 → A 資源)──');
  await expectStatus('B管理員 填A檢核表', jarB, 'PUT', itemPath(cycleA.id), [403], putBody);
  await expectStatus('B管理員 批次標記A', jarB, 'POST', `/api/cycles/${cycleA.id}/checklist/bulk`, [403]);
  await expectStatus('B管理員 送出A檢核表', jarB, 'POST', `/api/cycles/${cycleA.id}/checklist/submit`, [403]);
  await expectStatus('B管理員 匯出A檢核表', jarB, 'GET', `/api/cycles/${cycleA.id}/export/checklist`, [403]);
  await expectStatus('B管理員 匯出A改善報告', jarB, 'GET', `/api/cycles/${cycleA.id}/export/remediation-report`, [403]);
  await expectStatus('B管理員 填A缺失矯正措施', jarB, 'PUT', `/api/deficiencies/${defA.id}/action`, [403], { description: 'x' });
  await expectStatus('B管理員 開A週期頁(redirect)', jarB, 'GET', `/cycles/${cycleA.id}`, REDIRECTED);
  await expectStatus('B管理員 開A檢核表頁(redirect)', jarB, 'GET', `/cycles/${cycleA.id}/checklist`, REDIRECTED);

  console.log('\n── 委員指派隔離 ──');
  await expectStatus('未指派委員X 匯出A檢核表', jarX, 'GET', `/api/cycles/${cycleA.id}/export/checklist`, [403]);
  await expectStatus('未指派委員X 退回A檢核表', jarX, 'POST', `/api/cycles/${cycleA.id}/checklist/reopen`, [403], { reason: 'x' });
  await expectStatus('未指派委員X 開A檢核表頁(redirect)', jarX, 'GET', `/cycles/${cycleA.id}/checklist`, REDIRECTED);
  await expectStatus('指派委員Y 匯出B檢核表(未指派)', jarY, 'GET', `/api/cycles/${cycleB.id}/export/checklist`, [403]);

  console.log('\n── 權限升級防護(/api/admin)──');
  await expectStatus('B管理員 建機關', jarB, 'POST', '/api/admin/organizations', [403], { code: 'X', name: 'X' });
  await expectStatus('B管理員 建檢核表版本', jarB, 'POST', '/api/admin/checklist-versions', [403], { name: 'X', year: 2099 });
  await expectStatus('委員X 建機關', jarX, 'POST', '/api/admin/organizations', [403], { code: 'X', name: 'X' });

  console.log('\n── 未登入 ──');
  await expectStatus('匿名 匯出檢核表', null, 'GET', `/api/cycles/${cycleA.id}/export/checklist`, [401]);
  await expectStatus('匿名 填檢核表', null, 'PUT', itemPath(cycleA.id), [401], putBody);

  console.log('\n── 流程閉環行為(P2)──');
  await expectStatus('A管理員 未全答即送出', jarA, 'POST', `/api/cycles/${cycleA.id}/checklist/submit`, [400]);
  await expectStatus('委員Y 未送出即退回', jarY, 'POST', `/api/cycles/${cycleA.id}/checklist/reopen`, [409], { reason: 'x' });

  console.log('\n[isolation] 清理夾具…');
  await cleanup();

  const total = passCount + failures.length;
  console.log(`\n══ 結果:${passCount}/${total} 通過 ══`);
  if (failures.length > 0) {
    console.log('未通過:');
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log('跨機關隔離全數通過 ✓');
  }
}

main()
  .catch((e) => {
    console.error('[isolation] 測試執行失敗:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
