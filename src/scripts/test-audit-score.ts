/**
 * 委員評分送出完整性閘真值表(純函式,免 DB):
 *   npm run test:auditscore
 *
 * 驗 dimCountSum / validateScoreCompleteness —— 原內嵌於 AuditPad ScoreSection render 閉包、
 * 無法納入測試的「確認填寫完畢」核心送出閘,R7 抽出後於此鎖住規格。
 */
import { dimCountSum, validateScoreCompleteness } from '../lib/audit-score';

let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else fails.push(name);
}

// ── dimCountSum ──
check('全 null → null(還沒動筆)', dimCountSum({ c1: null, c2: null, c3: null, c4: null }) === null);
check('undefined → null', dimCountSum(undefined) === null);
check('有值 → 四格合計', dimCountSum({ c1: 2, c2: 1, c3: 0, c4: null }) === 3);
check('全 0(有填)→ 0 而非 null(誠實區分沒動筆與填 0)', dimCountSum({ c1: 0, c2: 0, c3: 0, c4: 0 }) === 0);

// ── validateScoreCompleteness ──
// CORE_BUSINESS 該構面 5 題、POLICY_ORG 3 題;其餘構面 total 視為 0(undefined)
const totals = { CORE_BUSINESS: { total: 5 }, POLICY_ORG: { total: 3 } };

// 空表:全構面沒動筆 → 硬擋 + 無 problems(分工下沒動的不提示)
{
  const r = validateScoreCompleteness({}, {}, totals);
  check('空表 → hardBlock', r.hardBlock === true);
  check('空表 → 無 problems', r.problems.length === 0);
}

// 一個完整構面(評分 + 四格合計===題數)→ 不硬擋、該構面無 problem
{
  const r = validateScoreCompleteness({ CORE_BUSINESS: 8 }, { CORE_BUSINESS: { c1: 5, c2: 0, c3: 0, c4: 0 } }, totals);
  check('一完整構面 → hardBlock false', r.hardBlock === false);
  check('完整構面不列 problem', !r.byDim.CORE_BUSINESS);
}

// 有評分但沒填判定數量 → problem「未填判定數量」,且無其他完整構面 → 硬擋
{
  const r = validateScoreCompleteness({ CORE_BUSINESS: 8 }, {}, totals);
  check('有評分沒填數量 → problem 未填判定數量', !!r.byDim.CORE_BUSINESS && r.byDim.CORE_BUSINESS.includes('未填判定數量'));
  check('無完整構面 → hardBlock', r.hardBlock === true);
}

// 判定數量合計 ≠ 題數 → problem「合計 X,應為 Y」
{
  const r = validateScoreCompleteness({ CORE_BUSINESS: 8 }, { CORE_BUSINESS: { c1: 2, c2: 0, c3: 0, c4: 0 } }, totals);
  check('合計不符 → problem 合計2應為5', r.byDim.CORE_BUSINESS?.includes('合計 2,應為 5') === true);
}

// 有一完整構面時,另一「完全沒動筆」的構面(POLICY_ORG)不列 problem(分工評分)
{
  const r = validateScoreCompleteness({ CORE_BUSINESS: 8 }, { CORE_BUSINESS: { c1: 5, c2: 0, c3: 0, c4: 0 } }, totals);
  check('沒動筆構面不列 problem', !r.byDim.POLICY_ORG);
}

// 有評分、四格合計 0 但題數 0(該構面 0 題)→ 視為完整(0===0)
{
  const r = validateScoreCompleteness({ SYSTEM_DEV: 5 }, { SYSTEM_DEV: { c1: 0, c2: 0, c3: 0, c4: 0 } }, {});
  check('題數 0 且合計 0 → 完整不硬擋', r.hardBlock === false && !r.byDim.SYSTEM_DEV);
}

console.log(`\n══ 委員評分送出完整性閘真值表:${pass}/${pass + fails.length} 通過 ══`);
if (fails.length > 0) {
  console.log('未通過:');
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log('dimCountSum + validateScoreCompleteness(硬性下限/軟性提示/分工略過)全數符合規格 ✓');
}
