/**
 * 通知政策真值表測試:npm run test:notify
 *
 * 把「週期前進到某狀態 → 該通知機關 / 委員嗎」寫成一張**獨立於實作的規格表**(EXPECT),
 * 逐格比對 lib/notify-policy 的 cycleTransitionNotify。任何人改動通知時機(例如又把 ONSITE 加回去
 * 寄信給機關、或漏掉資料齊備通知委員),這支測試立刻變紅(純函式、免啟伺服器、CI 可跑)。
 *
 * 這正是第十三批「實地稽核中不該寄信給機關(機關此階段無可操作項目)」之類流程合理性回饋,
 * 從人工逐封讀信判斷,變成規格鎖定 + 自動回歸。對應 docs/REVIEW-HEURISTICS.md「A. 通知」。
 */
import { cycleTransitionNotify } from '../lib/notify-policy';
import { CYCLE_STATUS_MESSAGES } from '../lib/notify';
import type { CycleStatus } from '../lib/types';

// 預期真值表(規格;與 notify-policy 實作彼此獨立,相符才算對)。
const EXPECT: Record<CycleStatus, { org: boolean; committee: boolean }> = {
  DRAFT: { org: false, committee: false }, // 不會 forward 進 DRAFT
  PREPARATION: { org: true, committee: false }, // 機關上傳資料
  READY: { org: true, committee: true }, // 機關:已齊備;委員:可開始審閱
  ONSITE: { org: false, committee: false }, // 雙方此階段於系統內無可操作項目(第十三批)
  REPORT_ISSUED: { org: true, committee: false },
  REMEDIATION: { org: true, committee: false },
  CLOSED: { org: true, committee: false },
};

const STATUSES = Object.keys(EXPECT) as CycleStatus[];

let pass = 0;
const failures: string[] = [];

for (const status of STATUSES) {
  const got = cycleTransitionNotify(status);
  for (const role of ['org', 'committee'] as const) {
    const expected = EXPECT[status][role];
    if (got[role] === expected) {
      pass++;
    } else {
      failures.push(`${status} × ${role}: 預期 ${expected ? '通知' : '不通知'},實得 ${got[role] ? '通知' : '不通知'}`);
    }
  }

  // 一致性:有機關訊息文案 ⇔ 政策 org=true(防止文案表與政策漂移)
  const hasMsg = Boolean(CYCLE_STATUS_MESSAGES[status]);
  if (hasMsg !== EXPECT[status].org) {
    failures.push(`${status}: 文案表${hasMsg ? '有' : '無'}條目,但政策 org=${EXPECT[status].org}(兩者須一致)`);
  } else {
    pass++;
  }
}

const total = pass + failures.length;
console.log(`\n══ 通知政策真值表:${pass}/${total} 通過 ══`);
if (failures.length > 0) {
  console.error('✗ 不符規格:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('週期狀態 → 通知對象 政策全數符合規格 ✓');
process.exit(0);
