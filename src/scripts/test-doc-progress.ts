/**
 * 七章文件進度尺真值表(純函式,免 DB):
 *   npm run test:docprogress
 *
 * 驗 deriveDocumentChapters 對「七章 × 七階段 × 計數狀態」派生的章節狀態(done/active/todo/locked)
 * 與可點性符合規格,防未來改動靜默漂移(W2/R4)。
 */
import { deriveDocumentChapters, type DocumentProgressInput, type ChapterStatus } from '../lib/document-progress';

let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else fails.push(name);
}

const FULL = {
  prepTech: { confirmed: 3, total: 3 },
  prepOnsite: { confirmed: 2, total: 2 },
  checklist: { answered: 87, total: 87, submitted: true },
};

function chapters(status: DocumentProgressInput['status'], opts: Partial<DocumentProgressInput> = {}) {
  return deriveDocumentChapters({
    cycleId: 'c1',
    status,
    prepTech: opts.prepTech ?? FULL.prepTech,
    prepOnsite: opts.prepOnsite ?? FULL.prepOnsite,
    checklist: opts.checklist ?? FULL.checklist,
    deficiency: opts.deficiency ?? { passed: 0, total: 0 },
    report: opts.report ?? { submitted: false, confirmed: false },
  });
}
const st = (cs: ReturnType<typeof chapters>, key: string): ChapterStatus | undefined => cs.find((c) => c.key === key)?.status;
const href = (cs: ReturnType<typeof chapters>, key: string) => cs.find((c) => c.key === key)?.href;

// 章節數恆為 7
check('恆 7 章', chapters('DRAFT').length === 7);

// DRAFT:資料準備/檢核表 locked、實地稽核 todo、缺失矯正 locked、報告 locked、結案 todo
{
  const cs = chapters('DRAFT', { prepTech: { confirmed: 0, total: 3 }, prepOnsite: { confirmed: 0, total: 2 }, checklist: { answered: 0, total: 87, submitted: false } });
  check('DRAFT prep-tech locked', st(cs, 'prep-tech') === 'locked');
  check('DRAFT prep-onsite locked', st(cs, 'prep-onsite') === 'locked');
  check('DRAFT checklist locked', st(cs, 'checklist') === 'locked');
  check('DRAFT onsite todo', st(cs, 'onsite') === 'todo');
  check('DRAFT remediation locked', st(cs, 'remediation') === 'locked');
  check('DRAFT report locked', st(cs, 'report') === 'locked');
  check('DRAFT closed todo', st(cs, 'closed') === 'todo');
  check('DRAFT locked 章節不可點', !href(cs, 'prep-tech') && !href(cs, 'checklist'));
}

// PREPARATION 部分完成:資料準備/檢核表 active
{
  const cs = chapters('PREPARATION', { prepTech: { confirmed: 1, total: 3 }, prepOnsite: { confirmed: 0, total: 2 }, checklist: { answered: 40, total: 87, submitted: false } });
  check('PREP prep-tech active', st(cs, 'prep-tech') === 'active');
  check('PREP prep-onsite active', st(cs, 'prep-onsite') === 'active');
  check('PREP checklist active', st(cs, 'checklist') === 'active');
  check('PREP active 章節可點', !!href(cs, 'prep-tech') && !!href(cs, 'checklist'));
  check('PREP onsite todo', st(cs, 'onsite') === 'todo');
}

// PREPARATION 全確認 + 檢核表已送出:資料準備/檢核表 done
{
  const cs = chapters('PREPARATION');
  check('PREP-done prep-tech done', st(cs, 'prep-tech') === 'done');
  check('PREP-done checklist done', st(cs, 'checklist') === 'done');
}

// 某 prep 類別無應備項目(total=0):已開放階段視為 done(刻意「不擋進度」)
{
  const cs = chapters('PREPARATION', { prepTech: { confirmed: 0, total: 0 } });
  check('prep total=0 已開放 → done', st(cs, 'prep-tech') === 'done');
}
// DRAFT + 該區無應備項目:仍 locked(不因 total=0 就在未啟動時顯綠勾;對抗審查修)
{
  const cs = chapters('DRAFT', { prepTech: { confirmed: 0, total: 0 } });
  check('DRAFT + prep total=0 → 仍 locked', st(cs, 'prep-tech') === 'locked');
}

// ONSITE:實地稽核 active、缺失矯正 locked
{
  const cs = chapters('ONSITE');
  check('ONSITE prep done', st(cs, 'prep-tech') === 'done' && st(cs, 'prep-onsite') === 'done');
  check('ONSITE checklist done', st(cs, 'checklist') === 'done');
  check('ONSITE onsite active', st(cs, 'onsite') === 'active');
  check('ONSITE onsite 里程碑不可點', !href(cs, 'onsite'));
  check('ONSITE remediation locked', st(cs, 'remediation') === 'locked');
}

// REPORT_ISSUED 尚未發布缺失(total=0):實地稽核 done、缺失矯正 active「待中心發布缺失」
{
  const cs = chapters('REPORT_ISSUED', { deficiency: { passed: 0, total: 0 } });
  check('REPORT onsite done', st(cs, 'onsite') === 'done');
  check('REPORT remediation active', st(cs, 'remediation') === 'active');
}

// REMEDIATION 2/5:缺失矯正 active、報告 locked(未全過)
{
  const cs = chapters('REMEDIATION', { deficiency: { passed: 2, total: 5 } });
  check('REM onsite done', st(cs, 'onsite') === 'done');
  check('REM remediation active', st(cs, 'remediation') === 'active');
  check('REM remediation 可點', !!href(cs, 'remediation'));
  check('REM report locked', st(cs, 'report') === 'locked');
}

// REMEDIATION 全過 + 報告已繳待確認:缺失矯正 done、報告 active
{
  const cs = chapters('REMEDIATION', { deficiency: { passed: 5, total: 5 }, report: { submitted: true, confirmed: false } });
  check('REM-done remediation done', st(cs, 'remediation') === 'done');
  check('REM-done report active', st(cs, 'report') === 'active');
  check('REM-done closed todo', st(cs, 'closed') === 'todo');
}

// CLOSED:全 7 章 done
{
  const cs = chapters('CLOSED', { deficiency: { passed: 5, total: 5 }, report: { submitted: true, confirmed: true } });
  const allKeys = ['prep-tech', 'prep-onsite', 'checklist', 'onsite', 'remediation', 'report', 'closed'];
  check('CLOSED 全章 done', allKeys.every((k) => st(cs, k) === 'done'));
}

// 章節序號 1..7 遞增
{
  const cs = chapters('ONSITE');
  check('index 1..7', cs.map((c) => c.index).join(',') === '1,2,3,4,5,6,7');
}

console.log(`\n══ 文件進度尺真值表:${pass}/${pass + fails.length} 通過 ══`);
if (fails.length > 0) {
  console.log('未通過:');
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log('七章 × 七階段狀態派生(done/active/todo/locked)+ 可點性全數符合規格 ✓');
}
