/**
 * 稽核週期 + 矯正措施狀態機真值表(純函式,免 DB):
 *   npm run test:statemachine
 *
 * 鎖住 lib/state-machine.ts 的 canTransition / canRollback / canActionTransition / actionEditable 全矩陣。
 * 規格(FWD/RBK/AFWD)為「手寫、獨立於實作」,故任何對 CYCLE_TRANSITIONS/CYCLE_ROLLBACKS/ACTION_TRANSITIONS
 * 的漂移都會被逐格比對抓到——尤其明確鎖住 REPORT_ISSUED 回退「只退一階到 ONSITE、不得一次跳回 DRAFT」
 * 的歷史回歸(批48 圖2 修正前曾誤設為跳回開立中)。
 */
import {
  canTransition,
  canRollback,
  nextStatuses,
  rollbackTargets,
  canActionTransition,
  actionEditable,
} from '../lib/state-machine';
import type { CycleStatus, ActionStatus, Role } from '../lib/types';

let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else fails.push(name);
}

const CYCLE_STATUSES: CycleStatus[] = ['DRAFT', 'PREPARATION', 'READY', 'ONSITE', 'REPORT_ISSUED', 'REMEDIATION', 'CLOSED'];
const ACTION_STATUSES: ActionStatus[] = ['PENDING', 'DRAFT', 'SUBMITTED', 'RETURNED', 'PASSED'];
const ROLES: Role[] = ['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR', 'OBSERVER'];

// ── 規格:週期前進允許邊 from|to → 允許角色(手寫,獨立於實作) ──
const FWD: Record<string, Role[]> = {
  'DRAFT|PREPARATION': ['SUPER_ADMIN'],
  'PREPARATION|READY': ['SUPER_ADMIN', 'AUDITOR'],
  'READY|ONSITE': ['SUPER_ADMIN'],
  'ONSITE|REPORT_ISSUED': ['SUPER_ADMIN'],
  'REPORT_ISSUED|REMEDIATION': ['SUPER_ADMIN'],
  'REMEDIATION|CLOSED': ['SUPER_ADMIN'],
};
// ── 規格:週期回退允許邊(每階段僅退一階;SUPER_ADMIN 限定) ──
const RBK: Record<string, Role[]> = {
  'PREPARATION|DRAFT': ['SUPER_ADMIN'],
  'READY|PREPARATION': ['SUPER_ADMIN'],
  'ONSITE|READY': ['SUPER_ADMIN'],
  'REPORT_ISSUED|ONSITE': ['SUPER_ADMIN'], // 關鍵:退一階到實地稽核,非跳回 DRAFT/開立中
  'REMEDIATION|REPORT_ISSUED': ['SUPER_ADMIN'],
  'CLOSED|REMEDIATION': ['SUPER_ADMIN'],
};

// 全矩陣逐格比對(7×7×4 前進 + 回退)
for (const from of CYCLE_STATUSES) {
  for (const to of CYCLE_STATUSES) {
    for (const role of ROLES) {
      const expT = (FWD[`${from}|${to}`] ?? []).includes(role);
      check(`canTransition ${from}→${to} [${role}]=${expT}`, canTransition(from, to, role) === expT);
      const expR = (RBK[`${from}|${to}`] ?? []).includes(role);
      check(`canRollback ${from}→${to} [${role}]=${expR}`, canRollback(from, to, role) === expR);
    }
  }
}

// 明確鎖住回退回歸(批48 圖2):缺失發布中只退一階到實地稽核
check('REPORT_ISSUED 回退目標僅 ONSITE', canRollback('REPORT_ISSUED', 'ONSITE', 'SUPER_ADMIN') === true);
check('REPORT_ISSUED 不得回退到 DRAFT(舊 bug:一次跳回開立中)', canRollback('REPORT_ISSUED', 'DRAFT', 'SUPER_ADMIN') === false);
check('REPORT_ISSUED 不得回退到 PREPARATION', canRollback('REPORT_ISSUED', 'PREPARATION', 'SUPER_ADMIN') === false);
check('REPORT_ISSUED 回退目標集合恰為 [ONSITE]', JSON.stringify(rollbackTargets('REPORT_ISSUED', 'SUPER_ADMIN')) === JSON.stringify(['ONSITE']));

// 非 SUPER_ADMIN 不得回退任何階段;nextStatuses/rollbackTargets 與 canX 一致
for (const from of CYCLE_STATUSES) {
  for (const role of ['ORG_ADMIN', 'AUDITOR', 'OBSERVER'] as Role[]) {
    check(`${role} 不得回退 ${from}`, rollbackTargets(from, role).length === 0);
  }
  for (const role of ROLES) {
    check(`nextStatuses(${from},${role}) 與 canTransition 一致`, nextStatuses(from, role).every((to) => canTransition(from, to, role)));
    check(`rollbackTargets(${from},${role}) 與 canRollback 一致`, rollbackTargets(from, role).every((to) => canRollback(from, to, role)));
  }
}

// ── 矯正措施狀態機:規格 + 全矩陣 ──
const AFWD: Record<string, Role[]> = {
  'PENDING|DRAFT': ['ORG_ADMIN'],
  'DRAFT|SUBMITTED': ['ORG_ADMIN'],
  'RETURNED|DRAFT': ['ORG_ADMIN'],
  'RETURNED|SUBMITTED': ['ORG_ADMIN'],
  'SUBMITTED|PASSED': ['AUDITOR'],
  'SUBMITTED|RETURNED': ['AUDITOR'],
};
for (const from of ACTION_STATUSES) {
  for (const to of ACTION_STATUSES) {
    for (const role of ROLES) {
      const exp = (AFWD[`${from}|${to}`] ?? []).includes(role);
      check(`canActionTransition ${from}→${to} [${role}]=${exp}`, canActionTransition(from, to, role) === exp);
    }
  }
}
// 關鍵越權邊:委員不得代機關送審、機關不得自審通過
check('AUDITOR 不得 DRAFT→SUBMITTED(代機關送審)', canActionTransition('DRAFT', 'SUBMITTED', 'AUDITOR') === false);
check('ORG_ADMIN 不得 SUBMITTED→PASSED(機關自審通過)', canActionTransition('SUBMITTED', 'PASSED', 'ORG_ADMIN') === false);
check('ORG_ADMIN 不得 SUBMITTED→RETURNED(機關自退)', canActionTransition('SUBMITTED', 'RETURNED', 'ORG_ADMIN') === false);

// ── actionEditable:機關可編輯矯正內容的狀態 ──
check('PENDING 可編輯', actionEditable('PENDING') === true);
check('DRAFT 可編輯', actionEditable('DRAFT') === true);
check('RETURNED 可編輯', actionEditable('RETURNED') === true);
check('SUBMITTED 不可編輯(送審中鎖定)', actionEditable('SUBMITTED') === false);
check('PASSED 不可編輯(已通過)', actionEditable('PASSED') === false);

console.log(`\n══ 狀態機真值表:${pass}/${pass + fails.length} 通過 ══`);
if (fails.length > 0) {
  console.log('未通過:');
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log('週期前進/回退(含 REPORT_ISSUED 只退一階回歸鎖)+ 矯正措施狀態機 + 可編輯狀態全數符合規格 ✓');
}
