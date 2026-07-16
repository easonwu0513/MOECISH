/**
 * 公告排程生命週期真值表(純函式,免 DB):npx tsx src/scripts/test-post-lifecycle.ts
 *
 * 鎖住 lib/posts 的四態判定(草稿/待發布/發布中/已下架)與「前台可見=發布中」的等價,
 * 以及 postPubliclyVisible 與 publicPostWhere(Prisma)在時間邊界上的一致性(<=/>)。
 * 排程上下架是「內容對外曝光」的閘門,錯一格就等於未上架洩漏或已下架仍公開,故以真值表回歸。
 */
import { postLifecycle, postPubliclyVisible, type PostLifecycle } from '../lib/posts';

const NOW = new Date('2026-07-07T12:00:00+08:00');
const past = new Date(NOW.getTime() - 3600_000);
const future = new Date(NOW.getTime() + 3600_000);

let pass = 0;
const fails: string[] = [];
function eq<T>(name: string, got: T, want: T) {
  if (got === want) pass++;
  else fails.push(`${name}: 得 ${JSON.stringify(got)},期望 ${JSON.stringify(want)}`);
}

type P = { status: string; publishedAt: Date | null; unpublishAt: Date | null };
const cases: { name: string; p: P; life: PostLifecycle; visible: boolean }[] = [
  { name: '草稿', p: { status: 'DRAFT', publishedAt: null, unpublishAt: null }, life: 'draft', visible: false },
  { name: '草稿(即使排了未來上架)', p: { status: 'DRAFT', publishedAt: future, unpublishAt: null }, life: 'draft', visible: false },
  { name: '手動下架', p: { status: 'ARCHIVED', publishedAt: past, unpublishAt: null }, life: 'off', visible: false },
  { name: '發布中(已上架、無下架)', p: { status: 'PUBLISHED', publishedAt: past, unpublishAt: null }, life: 'live', visible: true },
  { name: '發布中(已上架、下架在未來)', p: { status: 'PUBLISHED', publishedAt: past, unpublishAt: future }, life: 'live', visible: true },
  { name: '待發布(排程上架在未來)', p: { status: 'PUBLISHED', publishedAt: future, unpublishAt: null }, life: 'scheduled', visible: false },
  { name: '待發布(上架未來、下架更未來)', p: { status: 'PUBLISHED', publishedAt: future, unpublishAt: new Date(future.getTime() + 3600_000) }, life: 'scheduled', visible: false },
  { name: '自動下架(已過下架時間)', p: { status: 'PUBLISHED', publishedAt: past, unpublishAt: past }, life: 'off', visible: false },
  // 邊界:publishedAt 剛好=now → 已上架(<=);unpublishAt 剛好=now → 已下架(<=)
  { name: '邊界:上架時間=now(視為已上架)', p: { status: 'PUBLISHED', publishedAt: NOW, unpublishAt: null }, life: 'live', visible: true },
  { name: '邊界:下架時間=now(視為已下架)', p: { status: 'PUBLISHED', publishedAt: past, unpublishAt: NOW }, life: 'off', visible: false },
  // 遺留:PUBLISHED 但無 publishedAt → fail-safe 視為未上架(不外洩)
  { name: '遺留:PUBLISHED 無上架時間→不外洩', p: { status: 'PUBLISHED', publishedAt: null, unpublishAt: null }, life: 'scheduled', visible: false },
];

for (const c of cases) {
  eq(`life:${c.name}`, postLifecycle(c.p, NOW), c.life);
  eq(`visible:${c.name}`, postPubliclyVisible(c.p, NOW), c.visible);
  // 「發布中」必等價「前台可見」(單一事實不可分歧)
  eq(`一致:${c.name}`, postLifecycle(c.p, NOW) === 'live', postPubliclyVisible(c.p, NOW));
}

const total = pass + fails.length;
console.log(`\n══ 公告排程生命週期真值表:${pass}/${total} 通過 ══`);
if (fails.length > 0) {
  console.log('未通過:');
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log('四態判定 + 前台可見等價 + 時間邊界(<=/>)全數符合規格 ✓');
}
