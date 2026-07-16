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

/** 夾具機敏標記:甲醫院名 —— 被拒頁面回應中出現即代表受保護內容外流。 */
const LEAK_MARKER = '隔離測試甲醫院';

/**
 * 頁面級「拒絕」斷言(批53 迴響):/cycles/[id] 樹掛 loading.tsx(Suspense 邊界)後,
 * Next 對 document 請求先以 200 送出 loading 骨架,頁面授權的 redirect() 改以串流
 * NEXT_REDIRECT 指令抵達 —— HTTP 狀態碼不再必為 3xx。「拒絕」的實質 = 未流出受保護
 * 內容且把使用者轉走,故接受兩種形態:
 *   a) 傳統 3xx(無 loading.tsx 的頁面);
 *   b) 200 且 body 含串流 redirect 標記(redirect() 為 throw,頁面本體未渲染),
 *      並雙保險負面斷言:body 不得含甲院夾具標記(LEAK_MARKER)。
 */
async function expectPageDenied(name: string, jar: Jar, path: string) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: { cookie: cookieHeader(jar) },
  });
  if (REDIRECTED.includes(res.status)) {
    passCount++;
    console.log(`  [PASS] ${name} (${res.status})`);
    return;
  }
  if (res.status === 200) {
    const html = await res.text();
    const redirected = html.includes('NEXT_REDIRECT') || html.includes('http-equiv="refresh"');
    const leaked = html.includes(LEAK_MARKER);
    if (redirected && !leaked) {
      passCount++;
      console.log(`  [PASS] ${name} (200+串流 redirect,無內容外流)`);
      return;
    }
    const why = [redirected ? '' : '無串流 redirect 標記', leaked ? '夾具內容外流' : '']
      .filter(Boolean)
      .join('且');
    failures.push(`${name}: 200 但${why}`);
    console.log(`  [FAIL] ${name} — 200 但${why}`);
    return;
  }
  failures.push(`${name}: 預期 3xx 或 200+串流 redirect,得到 ${res.status}`);
  console.log(`  [FAIL] ${name} — 預期 3xx 或 200+串流 redirect,得到 ${res.status}`);
}

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

  await prisma.evidence.deleteMany({ where: { targetId: { in: cycleIds } } });
  const resps = await prisma.checklistResponse.findMany({ where: { cycleId: { in: cycleIds } }, select: { id: true } });
  // Evidence 為多型鬆散參照(無 FK):CHECKLIST_RESPONSE 佐證的 targetId 是 response id、不在 cycleIds,
  // 故須另以 response id 清除,否則 R3 檢核表佐證夾具會殘留累積(對抗審查 D1)。
  await prisma.evidence.deleteMany({ where: { targetId: { in: resps.map((r) => r.id) } } });
  await prisma.auditorComment.deleteMany({ where: { responseId: { in: resps.map((r) => r.id) } } });
  await prisma.checklistResponse.deleteMany({ where: { cycleId: { in: cycleIds } } });
  await prisma.auditScore.deleteMany({ where: { cycleId: { in: cycleIds } } });
  await prisma.auditFinding.deleteMany({ where: { cycleId: { in: cycleIds } } });
  const defs = await prisma.deficiency.findMany({ where: { cycleId: { in: cycleIds } }, select: { id: true } });
  await prisma.correctiveAction.deleteMany({ where: { deficiencyId: { in: defs.map((d) => d.id) } } });
  await prisma.deficiency.deleteMany({ where: { cycleId: { in: cycleIds } } });
  await prisma.practiceFeedback.deleteMany({ where: { practiceFinding: { cycleId: { in: cycleIds } } } }).catch(() => {});
  await prisma.practiceFinding.deleteMany({ where: { cycleId: { in: cycleIds } } }).catch(() => {});
  await prisma.cycleObserver.deleteMany({ where: { cycleId: { in: cycleIds } } }).catch(() => {});
  await prisma.userRole.deleteMany({ where: { user: { email: { startsWith: 'isotest-' } } } }).catch(() => {});
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
  const firstItemId = version.items[0].id;

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
  const [adminA, adminB, auditorX, auditorY, auditorZ, observer1, observer2] = await Promise.all([
    prisma.user.create({ data: { email: 'isotest-orga@test.local', name: '甲機關管理員', passwordHash: hash, role: 'ORG_ADMIN', organizationId: orgA.id, isActive: true } }),
    prisma.user.create({ data: { email: 'isotest-orgb@test.local', name: '乙機關管理員', passwordHash: hash, role: 'ORG_ADMIN', organizationId: orgB.id, isActive: true } }),
    prisma.user.create({ data: { email: 'isotest-auditor-x@test.local', name: '未指派委員X', passwordHash: hash, role: 'AUDITOR', isActive: true } }),
    prisma.user.create({ data: { email: 'isotest-auditor-y@test.local', name: '指派委員Y', passwordHash: hash, role: 'AUDITOR', isActive: true } }),
    // 批30 觀察員夾具:Z=同週期被指派但「非指導」委員(驗 mentor 隔離);O1=配對觀察員;O2=未配對觀察員
    prisma.user.create({ data: { email: 'isotest-auditor-z@test.local', name: '非指導委員Z', passwordHash: hash, role: 'AUDITOR', isActive: true } }),
    prisma.user.create({ data: { email: 'isotest-observer-1@test.local', name: '配對觀察員O1', passwordHash: hash, role: 'OBSERVER', isActive: true } }),
    prisma.user.create({ data: { email: 'isotest-observer-2@test.local', name: '未配對觀察員O2', passwordHash: hash, role: 'OBSERVER', isActive: true } }),
  ]);
  const now = new Date();
  const in30d = new Date(now.getTime() + 30 * 86400000);
  const cycleA = await prisma.auditCycle.create({
    data: { year: 2099, organizationId: orgA.id, checklistVersionId: version.id, status: 'PREPARATION', startDate: now, dueDate: in30d },
  });
  const cycleB = await prisma.auditCycle.create({
    data: { year: 2099, organizationId: orgB.id, checklistVersionId: version.id, status: 'PREPARATION', startDate: now, dueDate: in30d },
  });
  // 實地稽核(ONSITE)週期:供「委員評分階段閘」正向對照(ONSITE 可評);cycleA(PREPARATION)則驗階段閘擋下。
  const cycleOn = await prisma.auditCycle.create({
    data: { year: 2098, organizationId: orgA.id, checklistVersionId: version.id, status: 'ONSITE', startDate: now, dueDate: in30d },
  });
  await prisma.auditorAssignment.create({ data: { cycleId: cycleA.id, auditorId: auditorY.id } });
  await prisma.auditorAssignment.create({ data: { cycleId: cycleOn.id, auditorId: auditorY.id } });
  await prisma.auditorAssignment.create({ data: { cycleId: cycleOn.id, auditorId: auditorZ.id } });
  // 觀察員配對(批30):O1 配對至 ONSITE 週期,指導委員=Y(Z 同週期被指派但非其 mentor)
  await prisma.cycleObserver.create({ data: { cycleId: cycleOn.id, observerId: observer1.id, mentorId: auditorY.id } });
  // O1 的既有練習發現(直接建夾具,供讀取/回饋/編修隔離測試)
  const pf1 = await prisma.practiceFinding.create({
    data: { cycleId: cycleOn.id, observerId: observer1.id, aspect: 'STRATEGY', kind: 'IMPROVE', content: '隔離測試練習發現內容' },
  });
  // A 機關用印掃描檔夾具(供 signed-report 跨機關 IDOR/角色隔離測試,對抗審查 P0)
  const signedA = await prisma.signedReport.create({
    data: {
      cycleId: cycleA.id, fileName: 'iso-signed.pdf', sha256: 'isosignedhash',
      fileKey: `signed/${cycleA.id}/iso-signed.pdf`, uploadedById: adminA.id,
    },
  });
  const defA = await prisma.deficiency.create({
    data: { cycleId: cycleA.id, aspect: 'STRATEGY', type: 'IMPROVE', itemNo: 999, description: '隔離測試用缺失', createdById: adminA.id },
  });
  // A 機關的檢核回應 + 佐證(供「委員意見」「佐證 IDOR」隔離測試)
  const respA = await prisma.checklistResponse.create({
    data: { cycleId: cycleA.id, checklistItemId: firstItemId, compliance: 'COMPLIANT', description: '隔離測試回應' },
  });
  const eviA = await prisma.evidence.create({
    data: {
      targetType: 'AUDIT_CYCLE', targetId: cycleA.id,
      fileName: 'iso.txt', originalName: 'iso.txt', mimeType: 'text/plain',
      sizeBytes: 3, storageKey: `evidences/AUDIT_CYCLE/${cycleA.id}/iso.txt`, sha256: 'isohash',
      uploadedById: adminA.id,
    },
  });
  // ONSITE 週期的檢核表回應 + 佐證(供 R3「委員評分時就地檢視檢核表佐證,ONSITE 不受審閱窗口限制」隔離測試)
  const respOn = await prisma.checklistResponse.create({
    data: { cycleId: cycleOn.id, checklistItemId: firstItemId, compliance: 'PARTIALLY_COMPLIANT', description: '隔離測試ONSITE回應' },
  });
  await prisma.evidence.create({
    data: {
      targetType: 'CHECKLIST_RESPONSE', targetId: respOn.id,
      fileName: 'iso-cl.txt', originalName: 'iso-cl.txt', mimeType: 'text/plain',
      sizeBytes: 5, storageKey: `evidences/CHECKLIST_RESPONSE/${respOn.id}/iso-cl.txt`, sha256: 'isoclhash',
      uploadedById: adminA.id,
    },
  });

  console.log('[isolation] 登入 7 個測試帳號…');
  const [jarA, jarB, jarX, jarY, jarZ, jarO1, jarO2] = await Promise.all([
    login(adminA.email), login(adminB.email), login(auditorX.email), login(auditorY.email),
    login(auditorZ.email), login(observer1.email), login(observer2.email),
  ]);

  const itemPath = (cid: string) =>
    `/api/cycles/${cid}/checklist/${encodeURIComponent(firstItemNo)}`;
  const putBody = { compliance: 'COMPLIANT', description: '隔離測試', recordDocs: null, version: 0 };

  console.log('\n── 陽性對照(測試方法有效性)──');
  await expectAllowed('A管理員 匯出自家檢核表', jarA, 'GET', `/api/cycles/${cycleA.id}/export/checklist`);
  await expectAllowed('A管理員 填自家檢核表', jarA, 'PUT', itemPath(cycleA.id), putBody);
  // 委員於資料準備中(PREPARATION)不可見機關檢核表 → 改至下方「委員階段可見性閘」驗證

  console.log('\n── 跨機關隔離(B 帳號 → A 資源)──');
  await expectStatus('B管理員 填A檢核表', jarB, 'PUT', itemPath(cycleA.id), [403], putBody);
  await expectStatus('B管理員 批次標記A', jarB, 'POST', `/api/cycles/${cycleA.id}/checklist/bulk`, [403]);
  await expectStatus('B管理員 送出A檢核表', jarB, 'POST', `/api/cycles/${cycleA.id}/checklist/submit`, [403]);
  await expectStatus('B管理員 匯出A檢核表', jarB, 'GET', `/api/cycles/${cycleA.id}/export/checklist`, [403]);
  await expectStatus('B管理員 匯出A改善報告', jarB, 'GET', `/api/cycles/${cycleA.id}/export/remediation-report`, [403]);
  await expectStatus('B管理員 填A缺失矯正措施', jarB, 'PUT', `/api/deficiencies/${defA.id}/action`, [403], { description: 'x' });
  await expectPageDenied('B管理員 開A週期頁(redirect)', jarB, `/cycles/${cycleA.id}`);
  await expectPageDenied('B管理員 開A檢核表頁(redirect)', jarB, `/cycles/${cycleA.id}/checklist`);

  console.log('\n── 委員指派隔離 ──');
  await expectStatus('未指派委員X 匯出A檢核表', jarX, 'GET', `/api/cycles/${cycleA.id}/export/checklist`, [403]);
  await expectStatus('未指派委員X 退回A檢核表', jarX, 'POST', `/api/cycles/${cycleA.id}/checklist/reopen`, [403], { reason: 'x' });
  await expectPageDenied('未指派委員X 開A檢核表頁(redirect)', jarX, `/cycles/${cycleA.id}/checklist`);
  await expectStatus('指派委員Y 匯出B檢核表(未指派)', jarY, 'GET', `/api/cycles/${cycleB.id}/export/checklist`, [403]);

  console.log('\n── 權限升級防護(/api/admin)──');
  await expectStatus('B管理員 建機關', jarB, 'POST', '/api/admin/organizations', [403], { code: 'X', name: 'X' });
  await expectStatus('B管理員 建檢核表版本', jarB, 'POST', '/api/admin/checklist-versions', [403], { name: 'X', year: 2099 });
  await expectStatus('委員X 建機關', jarX, 'POST', '/api/admin/organizations', [403], { code: 'X', name: 'X' });

  console.log('\n── 中心催辦追蹤信(僅最高管理員可用)──');
  // 皆於 requireRole('SUPER_ADMIN') 即被擋(403/401),不會走到寄信,故無 email 副作用。
  await expectStatus('B管理員 催辦A週期(非中心)', jarB, 'POST', `/api/cycles/${cycleA.id}/track-remind`, [403]);
  await expectStatus('指派委員Y 催辦A週期(非中心)', jarY, 'POST', `/api/cycles/${cycleA.id}/track-remind`, [403]);
  await expectStatus('未指派委員X 催辦A週期(非中心)', jarX, 'POST', `/api/cycles/${cycleA.id}/track-remind`, [403]);
  await expectStatus('匿名 催辦A週期', null, 'POST', `/api/cycles/${cycleA.id}/track-remind`, [401]);

  console.log('\n── 委員求設審閱時段(僅受指派委員;正向會寄信給真實中心,故只驗負向)──');
  await expectStatus('未指派委員X 求設A時段', jarX, 'POST', `/api/cycles/${cycleA.id}/request-review-window`, [403]);
  await expectStatus('B管理員 求設A時段(跨機關)', jarB, 'POST', `/api/cycles/${cycleA.id}/request-review-window`, [403]);
  await expectStatus('A管理員 求設A時段(非委員)', jarA, 'POST', `/api/cycles/${cycleA.id}/request-review-window`, [403]);
  await expectStatus('匿名 求設A時段', null, 'POST', `/api/cycles/${cycleA.id}/request-review-window`, [401]);

  console.log('\n── 未登入 ──');
  await expectStatus('匿名 匯出檢核表', null, 'GET', `/api/cycles/${cycleA.id}/export/checklist`, [401]);
  await expectStatus('匿名 填檢核表', null, 'PUT', itemPath(cycleA.id), [401], putBody);

  console.log('\n── 流程閉環行為(P2)──');
  await expectStatus('A管理員 未全答即送出', jarA, 'POST', `/api/cycles/${cycleA.id}/checklist/submit`, [400]);
  // Round A:退回重填改僅中心(SUPER_ADMIN)→ 委員退回一律 403(權限),不再到 409(未送出)
  await expectStatus('委員Y 退回檢核表(僅中心可退→403)', jarY, 'POST', `/api/cycles/${cycleA.id}/checklist/reopen`, [403], { reason: 'x' });

  console.log('\n── 實地稽核模組(評分/發現/轉換)──');
  const scoreBody = { scores: [{ dimension: 'CORE_BUSINESS', score: 9 }] };
  const findingBody = { aspect: 'STRATEGY', kind: 'IMPROVE', content: '隔離測試發現內容' };
  // 正向對照:ONSITE 階段,指派委員可評分/記錄發現
  await expectAllowed('指派委員Y 評分ONSITE週期', jarY, 'PUT', `/api/cycles/${cycleOn.id}/audit/scores`, scoreBody);
  await expectAllowed('指派委員Y 新增ONSITE發現', jarY, 'POST', `/api/cycles/${cycleOn.id}/audit/findings`, findingBody);
  // 階段閘(P0 修補):資料準備中(PREPARATION,未到 ONSITE)即使被指派也不可評分/記錄發現/鎖定 → 403
  await expectStatus('指派委員Y 資料準備中評分(階段閘)', jarY, 'PUT', `/api/cycles/${cycleA.id}/audit/scores`, [403], scoreBody);
  await expectStatus('指派委員Y 資料準備中新增發現(階段閘)', jarY, 'POST', `/api/cycles/${cycleA.id}/audit/findings`, [403], findingBody);
  await expectStatus('指派委員Y 資料準備中鎖定評分(階段閘)', jarY, 'POST', `/api/cycles/${cycleA.id}/audit/lock`, [403], { locked: true });
  await expectStatus('未指派委員X 評分A週期', jarX, 'PUT', `/api/cycles/${cycleA.id}/audit/scores`, [403], scoreBody);
  await expectPageDenied('未指派委員X 開A稽核頁(redirect)', jarX, `/cycles/${cycleA.id}/audit`);
  await expectStatus('B管理員 評分A週期(非委員)', jarB, 'PUT', `/api/cycles/${cycleA.id}/audit/scores`, [403], scoreBody);
  await expectStatus('B管理員 轉入缺失(非最高管理員)', jarB, 'POST', `/api/cycles/${cycleA.id}/audit/convert`, [403]);
  await expectStatus('委員Y 轉入缺失(非最高管理員)', jarY, 'POST', `/api/cycles/${cycleA.id}/audit/convert`, [403]);

  console.log('\n── 佐證跨機關隔離(evidences IDOR 修補)──');
  const eviListA = `/api/evidences?targetType=AUDIT_CYCLE&targetId=${cycleA.id}`;
  await expectAllowed('A管理員 列自家佐證', jarA, 'GET', eviListA);
  await expectAllowed('指派委員Y 列A佐證', jarY, 'GET', eviListA);
  await expectStatus('B管理員 列A佐證', jarB, 'GET', eviListA, [403]);
  await expectStatus('未指派委員X 列A佐證', jarX, 'GET', eviListA, [403]);
  await expectStatus('B管理員 下載A佐證', jarB, 'GET', `/api/evidences/${eviA.id}/download`, [403]);
  await expectStatus('未指派委員X 下載A佐證', jarX, 'GET', `/api/evidences/${eviA.id}/download`, [403]);
  await expectStatus('匿名 列A佐證', null, 'GET', eviListA, [401]);

  console.log('\n── R3 委員評分就地檢視檢核表佐證(ONSITE 不受審閱窗口限制,跨機關/未指派仍擋)──');
  const eviListClOn = `/api/evidences?targetType=CHECKLIST_RESPONSE&targetId=${respOn.id}`;
  const eviListClA = `/api/evidences?targetType=CHECKLIST_RESPONSE&targetId=${respA.id}`;
  await expectAllowed('指派委員Y ONSITE列檢核表佐證(窗口未設仍可)', jarY, 'GET', eviListClOn);
  await expectStatus('未指派委員X ONSITE列檢核表佐證', jarX, 'GET', eviListClOn, [403]);
  await expectStatus('B管理員 ONSITE列檢核表佐證(跨機關)', jarB, 'GET', eviListClOn, [403]);
  await expectStatus('指派委員Y 資料準備中列檢核表佐證(窗口/階段閘擋)', jarY, 'GET', eviListClA, [403]);

  console.log('\n── 委員意見跨機關隔離 ──');
  const cmtBody = { content: '隔離測試委員意見內容' };
  // cycleA 為資料準備中(PREPARATION):委員此階段一律不可審閱機關檢核表/留言(見下方階段閘)
  await expectStatus('指派委員Y 對A回應留言(資料準備中未開放)', jarY, 'POST', `/api/responses/${respA.id}/comments`, [403], cmtBody);
  await expectStatus('未指派委員X 對A回應留言', jarX, 'POST', `/api/responses/${respA.id}/comments`, [403], cmtBody);
  await expectStatus('B管理員 對A回應留言(非委員)', jarB, 'POST', `/api/responses/${respA.id}/comments`, [403], cmtBody);

  console.log('\n── 委員階段可見性閘(資料準備中不可見機關檢核表)──');
  await expectStatus('指派委員Y 資料準備中匯出A檢核表', jarY, 'GET', `/api/cycles/${cycleA.id}/export/checklist`, [403]);
  await expectPageDenied('指派委員Y 資料準備中開A檢核表頁(redirect)', jarY, `/cycles/${cycleA.id}/checklist`);
  await expectPageDenied('指派委員Y 資料準備中開A審閱頁(redirect)', jarY, `/cycles/${cycleA.id}/review`);

  console.log('\n── 觀察員練習模組隔離(批30 師徒制)──');
  const practicePath = `/api/cycles/${cycleOn.id}/practice-findings`;
  const practiceBody = { aspect: 'STRATEGY', kind: 'SUGGEST', content: '隔離測試觀察員練習內容' };
  // 陽性:配對觀察員 O1 可讀寫自己的練習;指導委員 Y 可讀+回饋
  await expectAllowed('配對觀察員O1 列自己練習', jarO1, 'GET', practicePath);
  await expectAllowed('配對觀察員O1 新增練習發現', jarO1, 'POST', practicePath, practiceBody);
  await expectAllowed('配對觀察員O1 編修自己練習', jarO1, 'PATCH', `/api/practice-findings/${pf1.id}`, { content: '隔離測試練習發現內容(修)' });
  await expectAllowed('指導委員Y 列配對觀察員練習', jarY, 'GET', practicePath);
  await expectAllowed('指導委員Y 給練習回饋', jarY, 'POST', `/api/practice-findings/${pf1.id}/feedback`, { content: '隔離測試回饋' });
  // mentor 隔離:同週期被指派、但非該觀察員 mentor 的委員 Z 一律不可見/不可回饋
  await expectStatus('非指導委員Z 列練習(非mentor)', jarZ, 'GET', practicePath, [403]);
  await expectStatus('非指導委員Z 給練習回饋(非mentor)', jarZ, 'POST', `/api/practice-findings/${pf1.id}/feedback`, [403], { content: 'x' });
  // 配對隔離:未配對觀察員 O2 全擋;跨週期(O1→未配對的 cycleA)亦擋
  await expectStatus('未配對觀察員O2 列練習', jarO2, 'GET', practicePath, [403]);
  await expectPageDenied('未配對觀察員O2 開練習頁(redirect)', jarO2, `/cycles/${cycleOn.id}/practice`);
  await expectStatus('未配對觀察員O2 編修O1練習', jarO2, 'PATCH', `/api/practice-findings/${pf1.id}`, [403], { content: 'xxxxx' });
  await expectStatus('配對觀察員O1 列未配對週期練習', jarO1, 'GET', `/api/cycles/${cycleA.id}/practice-findings`, [403]);
  // 機關完全不可見練習(需求二-2)
  await expectStatus('A管理員 列練習(機關不可見)', jarA, 'GET', practicePath, [403]);
  // 觀察員不可回饋(回饋=指導委員專屬)
  await expectStatus('觀察員O1 自給回饋(非委員)', jarO1, 'POST', `/api/practice-findings/${pf1.id}/feedback`, [403], { content: 'x' });

  console.log('\n── 觀察員擋官方稽核面(完全移除評分/缺失/正式發現/審閱意見)──');
  await expectStatus('觀察員O1 評分(無評分功能)', jarO1, 'PUT', `/api/cycles/${cycleOn.id}/audit/scores`, [403], scoreBody);
  await expectStatus('觀察員O1 新增正式發現', jarO1, 'POST', `/api/cycles/${cycleOn.id}/audit/findings`, [403], findingBody);
  await expectPageDenied('觀察員O1 開評分頁(redirect→練習)', jarO1, `/cycles/${cycleOn.id}/audit`);
  await expectStatus('觀察員O1 留審閱意見(僅委員)', jarO1, 'POST', `/api/responses/${respOn.id}/comments`, [403], cmtBody);
  await expectPageDenied('觀察員O1 開缺失頁(不開放,redirect)', jarO1, `/cycles/${cycleOn.id}/deficiencies`);
  await expectStatus('觀察員O1 匯出檢核表(不提供下載)', jarO1, 'GET', `/api/cycles/${cycleOn.id}/export/checklist`, [403]);
  // 對抗審查修補回歸(端點層,非僅頁面 redirect):
  await expectStatus('觀察員O1 直打缺失清單 API(P1)', jarO1, 'GET', `/api/cycles/${cycleOn.id}/deficiencies`, [403]);
  await expectStatus('觀察員O1 列用印掃描檔清單(P2)', jarO1, 'GET', `/api/cycles/${cycleOn.id}/signed-reports`, [403]);
  await expectStatus('觀察員O1 上傳檢核表佐證(唯讀,P2)', jarO1, 'POST', '/api/evidences', [403], undefined);
  // 用印掃描檔跨機關 IDOR(P0):觀察員/未指派委員/他機關 一律不可下載他人用印檔
  await expectStatus('觀察員O1 下載A用印掃描檔(跨租戶IDOR,P0)', jarO1, 'GET', `/api/signed-reports/${signedA.id}/download`, [403]);
  await expectStatus('未指派委員X 下載A用印掃描檔', jarX, 'GET', `/api/signed-reports/${signedA.id}/download`, [403]);
  await expectStatus('B管理員 下載A用印掃描檔(他機關)', jarB, 'GET', `/api/signed-reports/${signedA.id}/download`, [403]);
  await expectStatus('指派委員Y 下載A用印掃描檔(委員不參與用印)', jarY, 'GET', `/api/signed-reports/${signedA.id}/download`, [403]);
  // 陽性:自家機關管理員通過授權(200);夾具檔案未實際落地,故 readFileByKey 可能 500——
  // 兩者皆證明「未被 403 擋下」(此案要證的是 allowlist 有放行自家機關,非檔案 I/O)。
  await expectStatus('A管理員 下載自家用印掃描檔(陽性:通過授權)', jarA, 'GET', `/api/signed-reports/${signedA.id}/download`, [200, 500]);
  // 觀察員檢核表佐證:ONSITE 練習豁免窗口(比照委員評分豁免;配對隔離仍在)
  await expectAllowed('配對觀察員O1 ONSITE列檢核表佐證(練習豁免窗口)', jarO1, 'GET', eviListClOn);
  await expectStatus('未配對觀察員O2 ONSITE列檢核表佐證', jarO2, 'GET', eviListClOn, [403]);

  console.log('\n── 多重身分/晉升(批31/32)──');
  await expectStatus('觀察員O1 切換為委員身分(無授權)', jarO1, 'POST', '/api/identity', [403], { role: 'AUDITOR', organizationId: null });
  await expectStatus('觀察員O1 切換為中心身分(無授權)', jarO1, 'POST', '/api/identity', [403], { role: 'SUPER_ADMIN', organizationId: null });
  await expectStatus('匿名 讀身分清單', null, 'GET', '/api/identity', [401]);
  await expectStatus('B管理員 授予身分(非中心)', jarB, 'POST', `/api/admin/users/${observer2.id}/roles`, [403], { role: 'AUDITOR' });
  await expectStatus('B管理員 晉升觀察員(非中心)', jarB, 'POST', `/api/admin/users/${observer1.id}/promote`, [403]);
  await expectStatus('委員Y 晉升觀察員(非中心)', jarY, 'POST', `/api/admin/users/${observer1.id}/promote`, [403]);
  await expectStatus('觀察員O2 讀他人身分授權(非中心)', jarO2, 'GET', `/api/admin/users/${observer1.id}/roles`, [403]);
  // 身分切換不可跨機關竄改(Q3 org-hopping):A 管理員只持 ORG_ADMIN@A,冒 organizationId=B 一律 403
  await expectStatus('A管理員 切換為B機關管理員(無授權/org-hop)', jarA, 'POST', '/api/identity', [403], { role: 'ORG_ADMIN', organizationId: orgB.id });
  await expectStatus('A管理員 切換為委員(無授權)', jarA, 'POST', '/api/identity', [403], { role: 'AUDITOR', organizationId: null });

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
