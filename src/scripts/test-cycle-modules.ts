/**
 * 週期四模組卡單一來源真值表(純函式,免 DB):
 *   npm run test:modules
 *
 * 驗 lib/cycle-modules.buildModuleNav —— 週期頁 2×2 模組卡與 prep 頁左欄子選單共同的
 * 導覽+狀態 SoT(取代原七章尺 test:docprogress 的覆蓋位):角色卡組、鎖定矩陣、
 * 狀態字串、委員審閱窗口四態、機關用印卡各階段。
 */
import { buildModuleNav, type ModuleNavItem } from '../lib/cycle-modules';
import { canAccess } from '../lib/access-policy';
import { auditorCanViewChecklistContent, auditorCanScore, CYCLE_STATUSES, type CycleStatus, type Role } from '../lib/types';

let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else fails.push(name);
}

const BASE = {
  cycleId: 'cyc-1',
  prep: { confirmed: 3, total: 5, draft: 1, insufficient: 1 },
  checklist: { submitted: false, answered: 10, total: 20 },
  def: { total: 4, passed: 1, pending: 2, returned: 1 },
  report: { submitted: false, confirmed: false },
};
const nav = (role: Role, status: CycleStatus, extra: Partial<Parameters<typeof buildModuleNav>[0]> = {}) =>
  buildModuleNav({
    ...BASE, role, status,
    auditorReviewState: role === 'AUDITOR' ? 'open' : undefined,
    observerReviewState: role === 'OBSERVER' ? 'open' : undefined,
    ...extra,
  });
const byKey = (items: ModuleNavItem[], key: string) => items.find((m) => m.key === key)!;

// ── 角色卡組(批26:檢核表=prep 子項 childOf 不再獨立成卡;中心第二格=進階設定) ──
const topKeys = (items: ModuleNavItem[]) => items.filter((m) => !m.childOf).map((m) => m.key).join();
for (const st of CYCLE_STATUSES) {
  check(`SUPER@${st} 全清單=prep,checklist,settings,audit,def`, nav('SUPER_ADMIN', st).map((m) => m.key).join() === 'prep,checklist,settings,audit,def');
  check(`SUPER@${st} 頂層卡=prep,settings,audit,def(檢核表為子項)`, topKeys(nav('SUPER_ADMIN', st)) === 'prep,settings,audit,def');
  check(`AUDITOR@${st} 卡組=prep,checklist,audit,def(審閱維持頂層)`, topKeys(nav('AUDITOR', st)) === 'prep,checklist,audit,def');
  check(`ORG@${st} 頂層卡=prep,def,report(檢核表為子項)`, topKeys(nav('ORG_ADMIN', st)) === 'prep,def,report');
  check(`ORG@${st} 檢核表存在且 childOf=prep`, byKey(nav('ORG_ADMIN', st), 'checklist').childOf === 'prep');
}
// ── 觀察員卡組(批30):prep/檢核表審閱(唯讀)/撰寫練習——無評分、無缺失管考、無用印 ──
for (const st of CYCLE_STATUSES) {
  check(`OBSERVER@${st} 卡組=prep,checklist,practice`, topKeys(nav('OBSERVER', st)) === 'prep,checklist,practice');
  const n = nav('OBSERVER', st);
  check(`OBSERVER@${st} 無 audit/def/report/settings 卡`, !n.some((m) => ['audit', 'def', 'report', 'settings'].includes(m.key)));
  check(`OBSERVER@${st} prep 鎖=!(可視檢核內容)`, byKey(n, 'prep').locked === !auditorCanViewChecklistContent(st));
  check(`OBSERVER@${st} 審閱鎖=!(可視檢核內容)`, byKey(n, 'checklist').locked === !auditorCanViewChecklistContent(st));
  check(`OBSERVER@${st} 練習鎖=!canAccess(practice.access)`, byKey(n, 'practice').locked === !canAccess('practice.access', 'OBSERVER', st));
}
check('OBSERVER 審閱卡標題=檢核表審閱(非委員審閱)', byKey(nav('OBSERVER', 'READY'), 'checklist').title === '檢核表審閱');
check('OBSERVER 審閱卡 href=/review', byKey(nav('OBSERVER', 'READY'), 'checklist').href === '/cycles/cyc-1/review');
check('OBSERVER 練習卡 href=/practice', byKey(nav('OBSERVER', 'ONSITE'), 'practice').href === '/cycles/cyc-1/practice');
check('OBSERVER 練習卡標題=稽核發現撰寫練習', byKey(nav('OBSERVER', 'ONSITE'), 'practice').title === '稽核發現撰寫練習');
check('OBSERVER 練習卡 caption 明示不進正式報告', byKey(nav('OBSERVER', 'ONSITE'), 'practice').caption.includes('不進入正式報告'));
check('OBSERVER@READY 練習仍鎖(ONSITE 才開)', byKey(nav('OBSERVER', 'READY'), 'practice').locked === true);
check('OBSERVER@ONSITE 練習開放+進行中', (() => { const m = byKey(nav('OBSERVER', 'ONSITE'), 'practice'); return !m.locked && m.status === '進行中'; })());
// 觀察員窗口四態(獨立窗口;文案用「觀察員審閱時段」)
check('OBSERVER@READY 窗口未設 → prep 鎖+提示未設定觀察員時段',
  byKey(nav('OBSERVER', 'READY', { observerReviewState: 'unset' }), 'prep').lockedHint === '中心尚未設定觀察員審閱時段');
check('OBSERVER@READY 窗口未開始 → 提示觀察員時段尚未開始',
  byKey(nav('OBSERVER', 'READY', { observerReviewState: 'before' }), 'checklist').lockedHint === '觀察員審閱時段尚未開始');
check('OBSERVER@READY 窗口已結束 → 提示觀察員時段已結束',
  byKey(nav('OBSERVER', 'READY', { observerReviewState: 'after' }), 'checklist').lockedHint === '觀察員審閱時段已結束');
check('OBSERVER@READY 窗口 open → 審閱卡開放中', byKey(nav('OBSERVER', 'READY'), 'checklist').status === '開放中');

// ── 指導委員卡(批30 師徒制):有配對觀察員的委員多一張「指導觀察員」入口 ──
check('AUDITOR 無配對 → 無 practice 卡', !nav('AUDITOR', 'ONSITE').some((m) => m.key === 'practice'));
check('AUDITOR 有配對 → 卡組尾增 practice', topKeys(nav('AUDITOR', 'ONSITE', { mentorObservers: 2 })) === 'prep,checklist,audit,def,practice');
check('mentor 卡標題=指導觀察員+人數', (() => { const m = byKey(nav('AUDITOR', 'ONSITE', { mentorObservers: 2 }), 'practice'); return m.title === '指導觀察員' && m.status === '2 位'; })());
check('mentor 卡 READY 仍鎖(ONSITE 起)', byKey(nav('AUDITOR', 'READY', { mentorObservers: 1 }), 'practice').locked === true);
check('mentor 卡 ONSITE 開放', byKey(nav('AUDITOR', 'ONSITE', { mentorObservers: 1 }), 'practice').locked === false);

// 進階設定卡(中心專屬):錨點直達、永不鎖、狀態=目前階段
check('SUPER 進階設定卡 href=/settings(批34 獨立頁)', byKey(nav('SUPER_ADMIN', 'ONSITE'), 'settings').href === '/cycles/cyc-1/settings');
check('SUPER 進階設定卡永不鎖不淡化', CYCLE_STATUSES.every((st) => { const m = byKey(nav('SUPER_ADMIN', st), 'settings'); return !m.locked && !m.muted; }));
check('ORG/AUDITOR 無進階設定卡', !nav('ORG_ADMIN', 'ONSITE').some((m) => m.key === 'settings') && !nav('AUDITOR', 'ONSITE').some((m) => m.key === 'settings'));

// ── 中心永不鎖 ──
for (const st of CYCLE_STATUSES) {
  check(`SUPER@${st} 四卡全不鎖`, nav('SUPER_ADMIN', st).every((m) => !m.locked));
}

// ── 委員鎖定矩陣(窗口 open 時,鎖定跟著階段閘走;與 access-policy 同源) ──
for (const st of CYCLE_STATUSES) {
  const n = nav('AUDITOR', st);
  check(`AUDITOR@${st} prep 鎖=!(可視檢核內容)`, byKey(n, 'prep').locked === !auditorCanViewChecklistContent(st));
  check(`AUDITOR@${st} 審閱鎖=!(可視檢核內容)`, byKey(n, 'checklist').locked === !auditorCanViewChecklistContent(st));
  check(`AUDITOR@${st} 評分鎖=!auditorCanScore`, byKey(n, 'audit').locked === !auditorCanScore(st));
  check(`AUDITOR@${st} 缺失鎖=!canAccess`, byKey(n, 'def').locked === !canAccess('deficiencies.view', 'AUDITOR', st));
}
// 哨兵值(防 access-policy 與此表同時改壞):READY 起審閱開、ONSITE 才評分
check('AUDITOR@PREPARATION 審閱鎖定', byKey(nav('AUDITOR', 'PREPARATION'), 'checklist').locked === true);
check('AUDITOR@READY 審閱開放', byKey(nav('AUDITOR', 'READY'), 'checklist').locked === false);
check('AUDITOR@READY 評分仍鎖', byKey(nav('AUDITOR', 'READY'), 'audit').locked === true);
check('AUDITOR@ONSITE 評分開放', byKey(nav('AUDITOR', 'ONSITE'), 'audit').locked === false);

// ── 委員審閱窗口四態(READY:階段已開,由窗口決定) ──
check('AUDITOR@READY 窗口未設 → prep 鎖+提示未設定',
  byKey(nav('AUDITOR', 'READY', { auditorReviewState: 'unset' }), 'prep').locked === true &&
  byKey(nav('AUDITOR', 'READY', { auditorReviewState: 'unset' }), 'prep').lockedHint === '中心尚未設定委員審閱時段');
check('AUDITOR@READY 窗口未開始 → 提示尚未開始',
  byKey(nav('AUDITOR', 'READY', { auditorReviewState: 'before' }), 'checklist').lockedHint === '委員審閱時段尚未開始');
check('AUDITOR@READY 窗口已結束 → 提示已結束',
  byKey(nav('AUDITOR', 'READY', { auditorReviewState: 'after' }), 'checklist').lockedHint === '委員審閱時段已結束');
check('AUDITOR@REPORT_ISSUED 窗口關 → 提示改「實地稽核階段已結束」(批69 情境化)',
  byKey(nav('AUDITOR', 'REPORT_ISSUED', { auditorReviewState: 'after' }), 'prep').lockedHint === '實地稽核階段已結束，非審閱時段');
check('AUDITOR@READY 窗口 open → 審閱卡進行中+primary+不淡化',
  (() => { const m = byKey(nav('AUDITOR', 'READY'), 'checklist'); return m.status === '進行中' && m.statusTone === 'primary' && !m.muted; })());

// ── 委員命名/導向:入口統一「委員審閱」→ /review;缺失讀數 reviewer-aware 由呼叫端已過濾 ──
check('AUDITOR 審閱卡標題=委員審閱', byKey(nav('AUDITOR', 'READY'), 'checklist').title === '委員審閱');
check('AUDITOR 審閱卡 href=/review', byKey(nav('AUDITOR', 'READY'), 'checklist').href === '/cycles/cyc-1/review');
check('ORG 檢核表卡 href=/checklist', byKey(nav('ORG_ADMIN', 'PREPARATION'), 'checklist').href === '/cycles/cyc-1/checklist');

// ── 機關鎖定:DRAFT 期 prep/檢核表鎖;缺失/用印依 access-policy ──
check('ORG@DRAFT prep 鎖', byKey(nav('ORG_ADMIN', 'DRAFT'), 'prep').locked === true);
check('ORG@DRAFT 檢核表鎖', byKey(nav('ORG_ADMIN', 'DRAFT'), 'checklist').locked === true);
check('ORG@PREPARATION prep 開', byKey(nav('ORG_ADMIN', 'PREPARATION'), 'prep').locked === false);
for (const st of CYCLE_STATUSES) {
  const n = nav('ORG_ADMIN', st);
  check(`ORG@${st} 缺失鎖=!canAccess`, byKey(n, 'def').locked === !canAccess('deficiencies.view', 'ORG_ADMIN', st));
  check(`ORG@${st} 用印鎖=!canAccess(signedReport.section)`, byKey(n, 'report').locked === !canAccess('signedReport.section', 'ORG_ADMIN', st));
}

// ── 機關用印卡狀態(與同頁 SignedReportPanel 可見性同判準;href 錨點=儀表板既有 #signed-report) ──
check('ORG@REMEDIATION 用印=待上傳', byKey(nav('ORG_ADMIN', 'REMEDIATION'), 'report').status === '待上傳');
check('ORG@REMEDIATION 已繳交 → 已繳交+primary',
  (() => { const m = byKey(nav('ORG_ADMIN', 'REMEDIATION', { report: { submitted: true, confirmed: false } }), 'report'); return m.status === '已繳交' && m.statusTone === 'primary'; })());
check('ORG@CLOSED 已確認 → 已確認+success',
  (() => { const m = byKey(nav('ORG_ADMIN', 'CLOSED', { report: { submitted: true, confirmed: true } }), 'report'); return m.status === '已確認' && m.statusTone === 'success'; })());
check('用印卡 href=#signed-report 錨點', byKey(nav('ORG_ADMIN', 'REMEDIATION'), 'report').href === '/cycles/cyc-1#signed-report');

// ── 狀態字串/讀數 ──
check('prep 狀態=3/5', byKey(nav('SUPER_ADMIN', 'PREPARATION'), 'prep').status === '3/5');
check('prep 全齊 → success+資料齊備(併檢核表摘要,批26)',
  (() => { const m = byKey(nav('SUPER_ADMIN', 'READY', { prep: { confirmed: 5, total: 5, draft: 0, insufficient: 0 } }), 'prep'); return m.statusTone === 'success' && m.caption === '資料齊備 · 檢核表 10/20'; })());
check('prep 未齊 caption=待繳/退補+檢核表摘要', byKey(nav('SUPER_ADMIN', 'PREPARATION'), 'prep').caption === '待繳 1 · 退補 1 · 檢核表 10/20');
check('prep caption 檢核表已送出摘要', byKey(nav('ORG_ADMIN', 'ONSITE', { checklist: { submitted: true, answered: 20, total: 20 } }), 'prep').caption.endsWith('檢核表已送出'));
check('委員 prep caption 不併檢核表摘要(審閱另有頂層卡)', !byKey(nav('AUDITOR', 'READY'), 'prep').caption.includes('檢核表'));
check('檢核表未送出=10/20', byKey(nav('ORG_ADMIN', 'PREPARATION'), 'checklist').status === '10/20');
check('檢核表已送出 → 已送出+success',
  (() => { const m = byKey(nav('ORG_ADMIN', 'ONSITE', { checklist: { submitted: true, answered: 20, total: 20 } }), 'checklist'); return m.status === '已送出' && m.statusTone === 'success'; })());
check('缺失=1/4+caption 待填/退回補正(批35)', (() => { const m = byKey(nav('SUPER_ADMIN', 'REMEDIATION'), 'def'); return m.status === '1/4' && m.caption === '待填 2 · 退回補正 1'; })());
check('缺失 0 筆=尚未發布', byKey(nav('SUPER_ADMIN', 'ONSITE', { def: { total: 0, passed: 0, pending: 0, returned: 0 } }), 'def').status === '尚未發布');
check('委員發布後 0 筆 → 0 項+無指派(非「尚未發布」)',
  (() => { const m = byKey(nav('AUDITOR', 'REPORT_ISSUED', { def: { total: 0, passed: 0, pending: 0, returned: 0 } }), 'def'); return m.status === '0 項' && m.caption === '目前無指派您審閱的缺失'; })());
check('委員發布前 0 筆 → 仍顯尚未發布', byKey(nav('AUDITOR', 'ONSITE', { def: { total: 0, passed: 0, pending: 0, returned: 0 } }), 'def').status === '尚未發布');
check('缺失全通過 → success', byKey(nav('ORG_ADMIN', 'REMEDIATION', { def: { total: 4, passed: 4, pending: 0, returned: 0 } }), 'def').statusTone === 'success');

// ── 階段聚焦(muted):當前階段相關卡不淡化 ──
check('audit 卡僅 ONSITE 不淡化', !byKey(nav('SUPER_ADMIN', 'ONSITE'), 'audit').muted && byKey(nav('SUPER_ADMIN', 'READY'), 'audit').muted);
check('prep 卡 DRAFT/PREPARATION 不淡化', !byKey(nav('SUPER_ADMIN', 'DRAFT'), 'prep').muted && !byKey(nav('SUPER_ADMIN', 'PREPARATION'), 'prep').muted && byKey(nav('SUPER_ADMIN', 'ONSITE'), 'prep').muted);
check('def 卡 REPORT_ISSUED 起不淡化', !byKey(nav('SUPER_ADMIN', 'REPORT_ISSUED'), 'def').muted && byKey(nav('SUPER_ADMIN', 'ONSITE'), 'def').muted);
check('report 卡 REMEDIATION 起不淡化', !byKey(nav('ORG_ADMIN', 'REMEDIATION'), 'report').muted && byKey(nav('ORG_ADMIN', 'ONSITE'), 'report').muted);

console.log(`\n══ 週期四模組卡真值表:${pass}/${pass + fails.length} 通過 ══`);
if (fails.length > 0) {
  console.log('未通過:');
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log('buildModuleNav(角色卡組/鎖定矩陣/窗口四態/用印卡/狀態字串/階段聚焦)全數符合規格 ✓');
}
