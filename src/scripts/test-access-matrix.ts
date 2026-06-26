/**
 * 權限政策真值表測試:npm run test:access
 *
 * 把「角色 × 週期階段 × 介面」的預期可見性寫成一張**獨立於實作的規格表**(EXPECT),
 * 逐格比對 lib/access-policy 的 canAccess。任何人不小心改動 canAccess、讓某角色在某階段
 * 看到不該看的東西,這支測試立刻變紅(純函式、免啟伺服器、CI 可跑)。
 *
 * 這正是 2026-06 一連串「委員資料準備中看到機關檢核表 / 機關開立中能上傳 / 委員看到彙整報告」
 * 之類階段權限破口該有的回歸網——把人工逐格肉眼抓,變成編譯期/CI 自動抓。
 */
import { canAccess, CYCLE_PHASE_ORDER, type Surface, type CyclePhase } from '../lib/access-policy';
import { ROLES, type Role } from '../lib/types';

const ALL: CyclePhase[] = [...CYCLE_PHASE_ORDER];
const NONE: CyclePhase[] = [];

// 預期真值表(規格;與 canAccess 實作彼此獨立,兩者相符才算對)。每格 = 該 surface×role「允許」的階段。
const EXPECT: Record<Surface, Record<Role, CyclePhase[]>> = {
  // 委員一律「資料齊備(READY)」後才可見機關檢核表;機關看自家、中心全程(租戶/指派另由 rbac 管)
  'checklist.view': {
    SUPER_ADMIN: ALL,
    ORG_ADMIN: ALL,
    AUDITOR: ['READY', 'ONSITE', 'REPORT_ISSUED', 'REMEDIATION', 'CLOSED'],
  },
  // 機關填寫/送出檢核表僅限資料準備中;開立中尚不可(避免中心尚未開放就被填報)
  'checklist.orgEdit': {
    SUPER_ADMIN: NONE,
    ORG_ADMIN: ['PREPARATION'],
    AUDITOR: NONE,
  },
  // 機關上傳/填說明僅限資料準備中;開立中尚不可
  'prep.orgEdit': {
    SUPER_ADMIN: NONE,
    ORG_ADMIN: ['PREPARATION'],
    AUDITOR: NONE,
  },
  // 用印掃描檔整段:機關/中心於矯正執行中之後可見;委員不參與
  'signedReport.section': {
    SUPER_ADMIN: ['REMEDIATION', 'CLOSED'],
    ORG_ADMIN: ['REMEDIATION', 'CLOSED'],
    AUDITOR: NONE,
  },
  // 上傳用印掃描檔:僅機關,結案後不可(已確認鎖定屬項目狀態,另判)
  'signedReport.upload': {
    SUPER_ADMIN: NONE,
    ORG_ADMIN: ['DRAFT', 'PREPARATION', 'READY', 'ONSITE', 'REPORT_ISSUED', 'REMEDIATION'],
    AUDITOR: NONE,
  },
  // 彙整報告:中心專用
  'auditReport.view': {
    SUPER_ADMIN: ALL,
    ORG_ADMIN: NONE,
    AUDITOR: NONE,
  },
};

const SURFACES = Object.keys(EXPECT) as Surface[];

let pass = 0;
const failures: string[] = [];

for (const surface of SURFACES) {
  for (const role of ROLES) {
    for (const phase of CYCLE_PHASE_ORDER) {
      const expected = EXPECT[surface][role as Role].includes(phase);
      const actual = canAccess(surface, role, phase);
      if (actual === expected) {
        pass++;
      } else {
        failures.push(`${surface} × ${role} × ${phase}: 預期 ${expected ? '允許' : '拒絕'},實得 ${actual ? '允許' : '拒絕'}`);
      }
    }
  }
}

const total = pass + failures.length;
console.log(`\n══ 權限真值表:${pass}/${total} 通過 ══`);
if (failures.length > 0) {
  console.error('✗ 不符規格:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('角色 × 階段 × 介面 存取政策全數符合規格 ✓');
process.exit(0);
