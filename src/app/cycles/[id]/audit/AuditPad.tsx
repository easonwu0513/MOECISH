'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Textarea } from '@/components/ui/Textarea';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { SaveStatus } from '@/components/ui/SaveStatus';
import { useToast } from '@/components/ui/Toast';
import { Plus, Check, FileText, ClipboardCheck, Copy, ChevronDown } from '@/components/icons';
import { DIMENSION_LABELS } from '@/lib/dimension';
import { DEFICIENCY_ASPECT_LABELS, COMPLIANCE_LABELS, COMPLIANCE_TONE, type ComplianceLevel, type DeficiencyAspect, type Dimension } from '@/lib/types';
import { LawPanel } from '@/components/checklist/LawBasis';
import { ProtectedFileLink } from '@/components/cycle/ProtectedFileLink';
import {
  snippetMatches, type FindingSnippetDTO,
} from '@/lib/finding-snippet';
import {
  ASPECT_DIMENSIONS, DIMENSION_MAX_SCORE, DIMENSION_NUM,
  gradeOf, gradeHint, GRADE_TONE, compareChecklistRef, parseRefs, sortRefs, sortRefsString,
  FINDING_KIND_LABELS, FINDING_KIND_HINTS, type FindingKind,
  dimCountSum, validateScoreCompleteness,
} from '@/lib/audit-score';
import { toFullWidthPunct } from '@/lib/fullwidth-punct';
import { toneClasses } from '@/lib/stage';
import { SURFACE_INFO } from '@/lib/tone';
import { cn } from '@/lib/cn';

export type DimStat = { total: number; c1: number; c2: number; c3: number; c4: number };
/** 委員手填之檢核結果數量(符/部分/不符/不適用;null=空白) */
export type DimCounts = { c1: number | null; c2: number | null; c3: number | null; c4: number | null };
const EMPTY_COUNTS: DimCounts = { c1: null, c2: null, c3: null, c4: null };
const COUNT_FIELDS: { key: keyof DimCounts; label: string }[] = [
  { key: 'c1', label: '符合' },
  { key: 'c2', label: '部分符合' },
  { key: 'c3', label: '不符合' },
  { key: 'c4', label: '不適用' },
];
export type DimIssue = { itemNo: string; content: string; level: string };
/** 機關檢核表佐證檔(依項次歸戶;委員評分側欄就地檢視) */
export type EvidenceFile = { id: string; name: string; sizeKB: number };
export type MyFinding = {
  id: string;
  aspect: DeficiencyAspect;
  kind: FindingKind;
  content: string;
  checklistRef: string | null;
  locked: boolean;
};
/** 項次 → 法規對照(供發現表單「法規對照」鈕展開) */
export type ItemLaw = { auditBasis: string | null; auditFocus: string | null; expectedEvidence: string | null };
/** 委員審閱筆記側欄一列(大改造B:附機關作答同框對照) */
export type ReviewNoteItem = {
  itemNo: string;
  /** 檢核項題目 */
  content: string;
  /** 委員本人筆記(可多輪) */
  notes: string[];
  /** 機關作答符合度(未作答為 null) */
  compliance?: string | null;
  /** 機關作答說明 */
  orgDesc?: string | null;
};

const ASPECTS: DeficiencyAspect[] = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'];
const ALL_DIMS: Dimension[] = ASPECTS.flatMap((a) => ASPECT_DIMENSIONS[a]);
const KINDS: FindingKind[] = ['COMPLIANCE', 'IMPROVE', 'SUGGEST'];
// 構面(九)→ 缺失構面(三):從不符合題帶入發現時自動歸構面
const DIM_TO_ASPECT: Record<string, DeficiencyAspect> = {};
for (const a of ASPECTS) for (const dim of ASPECT_DIMENSIONS[a]) DIM_TO_ASPECT[dim] = a;

// 複製文字到剪貼簿。正式機目前走 HTTP(尚未開 443),navigator.clipboard 只在安全內容
// (HTTPS/localhost)可用,故非安全內容時退回 execCommand('copy') 隱藏 textarea 後備。
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 落到後備 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// 五等第評分標準(實地稽核評分方式):依檢核結果「符合 / 部分符合」數量評定等第與分數,委員打分前參考。
const GRADE_STANDARD: {
  cond: string; grade: string; tone: 'success' | 'sage' | 'primary' | 'warning' | 'danger'; s10: string; s20: string;
}[] = [
  { cond: '所有項目皆符合 — 執行良好', grade: '優', tone: 'success', s10: '9–10 分', s20: '17–20 分' },
  { cond: '所有項目皆符合 — 執行尚可', grade: '良', tone: 'sage', s10: '7–8 分', s20: '13–16 分' },
  { cond: '符合項目數 > 部分符合項目數', grade: '佳', tone: 'primary', s10: '5–6 分', s20: '9–12 分' },
  { cond: '符合項目數 < 部分符合項目數', grade: '可', tone: 'warning', s10: '4 分', s20: '8 分' },
  { cond: '半數以上不符合', grade: '待改進', tone: 'danger', s10: '3 分（含）以下', s20: '7 分（含）以下' },
];

// ─────────────────────────────────────────────

export default function AuditPad({
  cycleId,
  canEdit,
  locked = false,
  practice = false,
  stats,
  itemRefs,
  itemContent = {},
  itemLaw = {},
  dimIssues = {},
  evidenceByItemNo = {},
  reviewNotes = {},
  reviewOpen = false,
  assignedLabels = [],
  focusAspects = [],
  snippets = [],
  initialScores,
  initialCounts,
  initialFindings,
}: {
  cycleId: string;
  canEdit: boolean;
  /** 委員已「確認填寫完畢」鎖定 → 唯讀,顯示「解除鎖定」 */
  locked?: boolean;
  /** 練習模式(批42 觀察員):同款 UI,評分/發現改打 practice-* 端點(獨立表硬隔離)。
   *  批45:練習亦有「確認填寫完畢/解除鎖定」流(走 practice-lock;鎖定後唯讀,第二階段作委員評分依據)。 */
  practice?: boolean;
  stats: Record<string, DimStat>;
  itemRefs: string[];
  itemContent?: Record<string, string>;
  /** 項次 → 法規對照(發現表單「法規對照」鈕用) */
  itemLaw?: Record<string, ItemLaw>;
  dimIssues?: Record<string, DimIssue[]>;
  /** 機關檢核表佐證檔,依項次歸戶(委員評分側欄就地檢視真實佐證) */
  evidenceByItemNo?: Record<string, EvidenceFile[]>;
  /** 委員本人於「委員審閱」階段留下的逐題筆記,依構面歸戶(佐證側欄就地對照;含機關作答同框對照) */
  reviewNotes?: Record<string, ReviewNoteItem[]>;
  /** 審閱窗口是否開啟:側欄「在審閱頁開啟」深連結僅窗口開啟時顯示(避免導到鎖定卡) */
  reviewOpen?: boolean;
  /** 指派的負責構面標籤(三構面四類);空 = 未指定(全構面) */
  assignedLabels?: string[];
  /** 對應的評分構面(3 aspect),用於評分表聚焦標示 */
  focusAspects?: DeficiencyAspect[];
  /** 發現片語庫(剪貼簿);最高管理員維護 */
  snippets?: FindingSnippetDTO[];
  initialScores: Record<string, number | null>;
  initialCounts: Record<string, DimCounts>;
  initialFindings: MyFinding[];
}) {
  // 鎖定前需確認「稽核發現」沒有未儲存的編輯(兩個子元件不共享 state,以此 ref 橋接)。
  const unsavedFindingsRef = useRef<() => boolean>(() => false);
  return (
    <div className="flex flex-col gap-6">
      {/* 對應檢核項次建議清單(委員輸入時下拉選 7.4 等有效項次) */}
      <datalist id="audit-item-refs">
        {itemRefs.map((r) => <option key={r} value={r} />)}
      </datalist>
      {assignedLabels.length > 0 && (
        <div className={`flex items-start gap-2.5 rounded-md ${SURFACE_INFO} px-4 py-3 text-body-sm text-primary-800`}>
          <Check size={16} className="mt-0.5 shrink-0" />
          <span>
            您本次負責構面：<span className="font-medium">{assignedLabels.join('、')}</span>
            。評分表已標示您負責的構面；其餘構面如非您職責可略過（未評的不計入您的小計）。
          </span>
        </div>
      )}
      {/* 三塊合一同框(W3):左=評分+發現工作區,右=委員審閱筆記常駐側欄(寬螢幕 sticky,窄螢幕堆疊於下)。
          側欄加寬 + 放大字級(頁面已 wide 吃滿寬),對年長委員更好讀。 */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_30rem] xl:items-start">
        <div className="flex flex-col gap-8 min-w-0">
          <ScoreSection cycleId={cycleId} canEdit={canEdit} locked={locked} practice={practice} stats={stats} dimIssues={dimIssues} focusAspects={focusAspects} initialScores={initialScores} initialCounts={initialCounts} unsavedFindingsRef={unsavedFindingsRef} />
          <FindingSection cycleId={cycleId} canEdit={canEdit} practice={practice} itemContent={itemContent} itemLaw={itemLaw} dimIssues={dimIssues} snippets={snippets} focusAspects={focusAspects} initialFindings={initialFindings} unsavedFindingsRef={unsavedFindingsRef} />
        </div>
        <aside className="xl:sticky xl:top-4 min-w-0">
          <EvidencePane
            reviewNotes={reviewNotes}
            evidenceByItemNo={evidenceByItemNo}
            focusAspects={focusAspects}
            cycleId={cycleId}
            canEdit={canEdit}
            reviewOpen={reviewOpen}
            noun={practice ? '觀察員審閱' : '委員審閱'}
          />
        </aside>
      </div>
    </div>
  );
}

// ───────────────── 委員審閱筆記常駐側欄(三塊合一同框之「佐證」塊)─────────────────
// 顯示委員本人於「委員審閱」階段留下的逐題筆記(取代原「機關自評部分/不符合」清單——委員逐題審閱,
// 不僅看機關自評)。放大字級、每題卡片化,對年長委員更好讀。
function EvidencePane({
  reviewNotes,
  evidenceByItemNo,
  focusAspects,
  cycleId,
  canEdit,
  reviewOpen,
  noun = '委員審閱',
}: {
  reviewNotes: Record<string, ReviewNoteItem[]>;
  evidenceByItemNo: Record<string, EvidenceFile[]>;
  focusAspects: DeficiencyAspect[];
  cycleId: string;
  canEdit: boolean;
  reviewOpen: boolean;
  /** 側欄筆記來源階段稱謂(批45):觀察員練習傳「觀察員審閱」,委員預設「委員審閱」 */
  noun?: string;
}) {
  const toast = useToast();
  const focusSet = new Set(focusAspects);
  const hasAny = Object.values(reviewNotes).some((v) => v.length > 0);
  return (
    <section className="rounded-lg border border-rule bg-card xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto" aria-label={`${noun}筆記`}>
      <div className="sticky top-0 z-[1] bg-card border-b border-rule px-5 py-4">
        <p className="text-title-md text-ink-900">{noun}筆記</p>
        <p className="text-body-sm text-ink-500 mt-1 leading-relaxed">
          您於「{noun}」階段留下的逐題筆記，評分時就地對照，不必切換頁面。
        </p>
      </div>
      {!hasAny ? (
        <p className="px-5 py-12 text-body-sm text-ink-500 text-center leading-relaxed">
          您在「{noun}」階段尚未留下逐題筆記。
          <br />
          可先於「{noun}」逐題記下審閱重點，評分時即可在此就地對照。
        </p>
      ) : (
        <div className="divide-y divide-rule">
          {ASPECTS.map((asp) => {
            const dims = ASPECT_DIMENSIONS[asp].filter((d) => (reviewNotes[d]?.length ?? 0) > 0);
            if (dims.length === 0) return null;
            const focused = focusSet.has(asp);
            return (
              <div key={asp} className={cn('border-l-2 border-transparent px-5 py-4', focused && 'border-rule-active bg-focus-wash')}>
                <p className="text-body font-semibold text-ink-900 mb-3">
                  {DEFICIENCY_ASPECT_LABELS[asp]}
                  {focused && <span className="ml-2 text-body-sm font-medium text-primary-700">· 您負責</span>}
                </p>
                {dims.map((dim) => (
                  <div key={dim} className="mb-4 last:mb-0">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-body-sm font-medium text-ink-700">{DIMENSION_LABELS[dim as Dimension]}</p>
                      {/* 窗口開啟時提供審閱頁深連結(構面錨點);窗口關閉導向鎖定卡=死鏈,不顯示 */}
                      {reviewOpen && (
                        <a
                          href={`/cycles/${cycleId}/review#dim-${dim}`}
                          className="shrink-0 text-caption text-primary-700 hover:underline focus-ring rounded-sm"
                        >
                          在審閱頁開啟 →
                        </a>
                      )}
                    </div>
                    <ul className="flex flex-col gap-3">
                      {reviewNotes[dim].map((it) => (
                        <li key={it.itemNo} className="rounded-md bg-paper-sunk px-3.5 py-3">
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 tabular-nums font-semibold text-primary-700 text-body-sm">{it.itemNo}</span>
                            <span className="min-w-0 flex-1 text-body-sm text-ink-700 leading-relaxed">{it.content}</span>
                            {it.compliance && (
                              <Chip size="sm" tone={COMPLIANCE_TONE[it.compliance as ComplianceLevel] ?? 'neutral'}>
                                {COMPLIANCE_LABELS[it.compliance as ComplianceLevel] ?? it.compliance}
                              </Chip>
                            )}
                          </div>
                          <div className="mt-2.5 flex flex-col gap-2">
                            {it.notes.map((n, idx) => (
                              <p key={idx} className="border-l-2 border-primary-300 pl-3 text-body-sm text-ink-900 leading-relaxed whitespace-pre-wrap">
                                {n}
                              </p>
                            ))}
                          </div>
                          {/* 機關作答同框對照(大改造B):不必跳回審閱頁查機關怎麼說 */}
                          {it.orgDesc?.trim() && (
                            <details className="mt-2.5 group">
                              <summary className="cursor-pointer text-caption text-ink-500 hover:text-ink-900 focus-ring rounded-sm select-none">
                                機關作答說明<span className="group-open:hidden">（展開）</span>
                              </summary>
                              <p className="mt-1.5 rounded-md bg-card border border-rule px-3 py-2 text-body-sm text-ink-700 leading-relaxed whitespace-pre-wrap">
                                {it.orgDesc}
                              </p>
                            </details>
                          )}
                          {(evidenceByItemNo[it.itemNo]?.length ?? 0) > 0 && (
                            <div className="mt-2.5 flex flex-col gap-1">
                              <span className="text-caption text-ink-500">機關佐證（僅供線上檢視）：</span>
                              {evidenceByItemNo[it.itemNo].map((f) => (
                                <ProtectedFileLink key={f.id} fileId={f.id} name={f.name} sizeKB={f.sizeKB} viewOnly />
                              ))}
                            </div>
                          )}
                          {/* 複製筆記原文到剪貼簿:委員可自行貼到下方發現列所需之處(待改善/建議由委員自選),
                              不再自動建立「待改善」發現、也不合併多則筆記,避免一律帶入造成困擾。 */}
                          {canEdit && (
                            <div className="mt-2.5">
                              <Button
                                size="sm"
                                variant="text"
                                leadingIcon={<Copy size={13} />}
                                onClick={async () => {
                                  const ok = await copyToClipboard(it.notes.join('\n'));
                                  if (ok) toast.success('已複製筆記', '可貼到下方發現列，並自選「待改善事項」或「建議事項」。');
                                  else toast.error('複製失敗', '請手動選取筆記文字複製。');
                                }}
                              >
                                複製為發現
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ───────────────── 評分表 ─────────────────────

function ScoreSection({
  cycleId, canEdit, locked, practice = false, stats, dimIssues, focusAspects = [], initialScores, initialCounts, unsavedFindingsRef,
}: {
  cycleId: string;
  canEdit: boolean;
  locked: boolean;
  practice?: boolean;
  stats: Record<string, DimStat>;
  dimIssues: Record<string, DimIssue[]>;
  focusAspects?: DeficiencyAspect[];
  initialScores: Record<string, number | null>;
  initialCounts: Record<string, DimCounts>;
  unsavedFindingsRef: MutableRefObject<() => boolean>;
}) {
  const focusSet = new Set(focusAspects);
  // 構面收合(批44):委員/觀察員被指派特定構面時,只展開負責構面、其餘預設收合,免上下捲過無關構面找評分標準;
  // 未指派特定構面(全構面)則全展開。點標題列可自行展開/收合其他構面。
  const [collapsedAspects, setCollapsedAspects] = useState<Set<DeficiencyAspect>>(
    () => new Set(focusAspects.length > 0 ? ASPECTS.filter((a) => !focusSet.has(a)) : []),
  );
  const toggleAspect = (a: DeficiencyAspect) =>
    setCollapsedAspects((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  const toast = useToast();
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, number | null>>(initialScores);
  const [counts, setCounts] = useState<Record<string, DimCounts>>(initialCounts);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [lockBusy, setLockBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 確認視窗:非空=有「動過但沒填完」的構面,列出後詢問委員是否仍要送出(軟性提示);空=全部完整的一般確認
  const [confirmProblems, setConfirmProblems] = useState<string[]>([]);
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);
  // 解除鎖定前置:委員須先勾選「已告知中心工作人員」才可按(UAT 批63)
  const [unlockAck, setUnlockAck] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  // debounce 儲存讀「最新」狀態,避免 setTimeout 捕捉到 stale 快照(連續改多格時漏存)
  const scoresRef = useRef(scores);
  useEffect(() => { scoresRef.current = scores; }, [scores]);
  const countsRef = useRef(counts);
  useEffect(() => { countsRef.current = counts; }, [counts]);
  // 卸載搶救(批51):標記是否有未存變更 + 評分端點,供 flush 與 save 共用。
  const dirtyRef = useRef(false);
  const scoreUrl = practice ? `/api/cycles/${cycleId}/practice-scores` : `/api/cycles/${cycleId}/audit/scores`;

  function scheduleSave() {
    setSaveState('dirty');
    dirtyRef.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 900);
  }

  function setScore(dim: Dimension, raw: string) {
    const max = DIMENSION_MAX_SCORE[dim];
    let v: number | null = raw === '' ? null : Math.floor(Number(raw));
    if (v !== null) {
      if (Number.isNaN(v)) return;
      v = Math.max(0, Math.min(max, v));
    }
    setScores((prev) => ({ ...prev, [dim]: v }));
    clearProblem(dim);
    scheduleSave();
  }

  function setCount(dim: Dimension, key: keyof DimCounts, raw: string) {
    let v: number | null = raw === '' ? null : Math.floor(Number(raw));
    if (v !== null) {
      if (Number.isNaN(v)) return;
      v = Math.max(0, Math.min(999, v));
    }
    setCounts((prev) => ({ ...prev, [dim]: { ...(prev[dim] ?? EMPTY_COUNTS), [key]: v } }));
    clearProblem(dim);
    scheduleSave();
  }

  // 組評分 PUT 的 body(讀 ref 取最新值);save() 與卸載搶救 flush 共用,避免兩處組法漂移。
  function buildScoreBody() {
    const sc = scoresRef.current;
    const cc = countsRef.current;
    return {
      scores: ALL_DIMS.map((dimension) => ({
        dimension,
        score: sc[dimension] ?? null,
        cntComply: cc[dimension]?.c1 ?? null,
        cntPartial: cc[dimension]?.c2 ?? null,
        cntNonComply: cc[dimension]?.c3 ?? null,
        cntNa: cc[dimension]?.c4 ?? null,
      })),
    };
  }

  // 送出全 9 構面的評分 + 委員手填數量;後端依「有評分或有數量」決定保留/刪除。
  async function save(): Promise<boolean> {
    setSaveState('saving');
    const res = await fetch(scoreUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildScoreBody()),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('評分儲存失敗', j.error);
      setSaveState('dirty');
      return false;
    }
    setSaveState('saved');
    dirtyRef.current = false;
    return true;
  }

  async function manualSave() {
    if (timer.current) clearTimeout(timer.current);
    if (await save()) toast.success('已暫存', '評分與檢核數量已儲存，可稍後再繼續。');
  }
  // 送出/鎖定端點與通知對象:練習模式走 practice-lock,通知對象含指派的指導委員(批45)
  const lockUrl = practice ? `/api/cycles/${cycleId}/practice-lock` : `/api/cycles/${cycleId}/audit/lock`;
  const notifyTarget = practice ? '工作人員與指派給您的指導委員' : '中心工作人員';
  // 確認填寫完畢 → 先存當前評分,再鎖定(rebuild 後整頁唯讀)
  async function doConfirmDone() {
    if (timer.current) clearTimeout(timer.current);
    setLockBusy(true);
    if (!(await save())) { setLockBusy(false); return; }
    const res = await fetch(lockUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locked: true }),
    });
    setLockBusy(false);
    setConfirmOpen(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error('鎖定失敗', j.error); return; }
    toast.success('已確認填寫完畢', '評分與發現已鎖定；如需修改請按「解除鎖定」。');
    router.refresh();
  }
  async function unlock() {
    setLockBusy(true);
    const res = await fetch(lockUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locked: false }),
    });
    setLockBusy(false);
    setUnlockConfirmOpen(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error('解除鎖定失敗', j.error); return; }
    toast.success('已解除鎖定', `請通知${notifyTarget}有內容異動，您可再編輯。`);
    router.refresh();
  }

  // 卸載搶救(批51):元件卸載時(切換週期分頁/關頁)若有未存變更,以 keepalive 補送最新評分。
  // 就地切換分頁不觸發 beforeunload,且下方 timer 會被 cleanup 清掉,否則剛輸入未達 900ms 的評分會靜默消失。
  const flushRef = useRef<() => void>(() => {});
  flushRef.current = () => {
    if (!canEdit || !dirtyRef.current) return;
    try {
      fetch(scoreUrl, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildScoreBody()),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* 盡力搶救;失敗不阻斷卸載 */
    }
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); flushRef.current(); }, []);

  const myTotal = Object.values(scores).reduce<number>((a, v) => a + (v ?? 0), 0);
  const filledCount = Object.values(scores).filter((v) => v !== null && v !== undefined).length;

  /** 某構面判定數量四格合計(吃 lib/audit-score 純函式;供行內提示區分「還沒動筆」與「合計 0」) */
  const countSum = (dim: Dimension): number | null => dimCountSum(counts[dim]);

  // 送出完整性閘改吃 lib/audit-score.validateScoreCompleteness(純函式,已納 test:auditscore 真值表);
  // 硬性下限=至少一完整構面,其餘軟性提示;後端 lock API 另有權威硬擋。此處僅即時回饋 + 軟性提示清單。
  const validateCompleteness = () => validateScoreCompleteness(scores, counts, stats);

  // 送出被擋的構面 → 行內常駐紅字(toast 只活 6 秒,錯誤要留在表上);修正該構面即清除
  const [problemByDim, setProblemByDim] = useState<Record<string, string>>({});
  function clearProblem(dim: Dimension) {
    setProblemByDim((prev) => {
      if (!(dim in prev)) return prev;
      const next = { ...prev };
      delete next[dim];
      return next;
    });
  }

  return (
    <section>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => !lockBusy && !o && setConfirmOpen(false)}
        title={confirmProblems.length > 0 ? '部分構面尚未填寫完整，仍要送出？' : '確認填寫完畢？'}
        description={
          confirmProblems.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-md border border-warning-200 bg-warning-50 px-3.5 py-3 text-body-sm text-warning-800">
                <p className="font-medium">以下構面尚未填寫完整：</p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                  {confirmProblems.slice(0, 9).map((p) => <li key={p}>{p}</li>)}
                </ul>
                <p className="mt-2 text-caption text-warning-700 leading-relaxed">
                  分工評分下可僅送出您負責的構面；若確定其餘構面非本次職責，可直接送出。若為漏填，請取消後補齊。
                </p>
              </div>
              <p>將鎖定您的評分與發現，鎖定後無法修改。如需修改須「解除鎖定」，屆時請通知{notifyTarget}有內容異動。</p>
            </div>
          ) : (
            `將鎖定您的評分與發現，鎖定後無法修改。如需修改須「解除鎖定」，屆時請通知${notifyTarget}有內容異動。`
          )
        }
        confirmLabel={confirmProblems.length > 0 ? '仍要送出並鎖定' : '確認並鎖定'}
        onConfirm={doConfirmDone}
        loading={lockBusy}
      />
      <ConfirmDialog
        open={unlockConfirmOpen}
        onOpenChange={(o) => !lockBusy && !o && setUnlockConfirmOpen(false)}
        title="解除鎖定？"
        description={
          <div className="flex flex-col gap-3">
            <p>
              解除鎖定後，請通知{notifyTarget}您的評分/發現有內容異動{practice ? '（此練習為指導委員評分之依據）' : ''}。
              請僅在確實需要修改時解除；修改完請再次按「確認填寫完畢」。
            </p>
            {/* 前置勾選(UAT 批63):委員須先告知工作人員,勾選後才可按「解除鎖定」 */}
            <label className="flex items-start gap-2 rounded-md border border-rule bg-paper-sunk px-3 py-2.5 text-body-sm text-ink-900 cursor-pointer">
              <input
                type="checkbox"
                checked={unlockAck}
                onChange={(e) => setUnlockAck(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded focus-ring accent-primary-600"
              />
              <span>我已告知{notifyTarget}，將解除鎖定重新修改{practice ? '練習評分與發現' : '實地稽核評分與稽核發現'}。</span>
            </label>
          </div>
        }
        confirmLabel="解除鎖定"
        onConfirm={unlock}
        loading={lockBusy}
        confirmDisabled={!unlockAck}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-title-lg text-ink-900">稽核評分</h2>
          <p className="text-body-sm text-ink-500 mt-0.5 leading-relaxed">
            九項合計滿分 100;檢核結果數量請由您逐構面填寫（預設空白），機關自評僅列於各構面下方供參。<br />
            {focusSet.size > 0 && <>可只評您負責的構面（未評的不計入您的小計）。</>}
            確認填寫完畢時，至少須完整填寫一個構面（評分 + 判定數量合計符題數）；其餘動過但未填完的構面會於送出前提示您確認（分工評分不強制全填）。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <SaveStatus state={saveState === 'saved' ? 'idle' : saveState} dirtyLabel="未儲存" />
          )}
          {/* 九構面進度點:一眼看出評到哪(已評=實心主色) */}
          <span className="hidden sm:inline-flex items-center gap-1" aria-label={`九構面已評 ${filledCount} 項`} role="img">
            {ALL_DIMS.map((d) => (
              <span
                key={d}
                title={DIMENSION_LABELS[d]}
                className={`h-1.5 w-1.5 rounded-full ${scores[d] !== null && scores[d] !== undefined ? 'bg-primary-600' : 'bg-rule-strong'}`}
              />
            ))}
          </span>
          <Chip tone={filledCount > 0 ? 'primary' : 'neutral'} size="sm">
            已評 {filledCount} 項{filledCount > 0 ? `・小計 ${myTotal} 分` : ''}
          </Chip>
          {canEdit && (
            <>
              <Button size="sm" variant="tonal" onClick={manualSave} loading={saveState === 'saving'}>暫存</Button>
              {/* 送出並鎖定(批45:練習與委員一致——不能只暫存,要有明確送出點;第二階段作委員評分依據) */}
              {<Button
                size="sm"
                leadingIcon={<Check size={14} />}
                loading={lockBusy}
                onClick={() => {
                  // 鎖定前擋下未儲存的稽核發現,避免按「確認填寫完畢」後唯讀導致編輯遺失
                  if (unsavedFindingsRef.current()) {
                    toast.error('尚有稽核發現未儲存', '請先逐條按「儲存」或取消編輯，再確認填寫完畢。');
                    return;
                  }
                  const { hardBlock, problems, byDim } = validateCompleteness();
                  // 硬性下限:連一個完整構面都沒有 → 不可送出(後端亦擋);問題構面行內標紅常駐(toast 只活 6 秒)
                  if (hardBlock) {
                    setProblemByDim(byDim);
                    toast.error(
                      '尚無完整填寫的構面，無法確認填寫完畢',
                      '請至少完整填寫一個構面（評分 + 判定數量合計符題數）後再送出；已於下方表格標示。',
                    );
                    return;
                  }
                  // 有「動過但沒填完」的構面 → 軟性提示:確認視窗列出並詢問是否仍要送出;否則直接一般確認
                  setProblemByDim(problems.length > 0 ? byDim : {});
                  setConfirmProblems(problems);
                  setConfirmOpen(true);
                }}
              >
                確認填寫完畢
              </Button>}
            </>
          )}
          {locked && (
            <>
              <Chip tone="success" size="sm" dot>已確認填寫完畢</Chip>
              {/* 每次開啟都重置勾選,確認視窗的「已告知工作人員」不可沿用上次狀態 */}
              <Button size="sm" variant="tonal" onClick={() => { setUnlockAck(false); setUnlockConfirmOpen(true); }} loading={lockBusy}>解除鎖定</Button>
            </>
          )}
        </div>
      </div>

      <details open className="mb-4 rounded-lg border border-rule bg-card overflow-hidden">
        <summary className="cursor-pointer select-none px-5 py-3 text-body-sm font-medium text-ink-900 hover:bg-paper-sunk">
          五等第評分標準說明（依檢核結果「符合 / 部分符合 / 不符合」數量評定等第與分數；不適用項目不計）
        </summary>
        <div className="px-5 pb-4 overflow-x-auto">
          <table className="w-full text-caption border-collapse min-w-[30rem]">
            <thead>
              <tr className="text-ink-500">
                <th className="text-left font-medium py-1.5 pr-3 border-b border-rule">檢核結果數量</th>
                <th className="text-center font-medium py-1.5 px-2 border-b border-rule">等第</th>
                <th className="text-center font-medium py-1.5 px-2 border-b border-rule">配分 10 分</th>
                <th className="text-center font-medium py-1.5 px-2 border-b border-rule">配分 20 分</th>
              </tr>
            </thead>
            <tbody>
              {GRADE_STANDARD.map((r) => (
                <tr key={r.grade} className="border-b border-rule last:border-b-0">
                  <td className="py-1.5 pr-3 text-ink-900">{r.cond}</td>
                  <td className="text-center py-1.5 px-2"><Chip size="sm" tone={r.tone}>{r.grade}</Chip></td>
                  <td className="text-center py-1.5 px-2 tabular-nums text-ink-500">{r.s10}</td>
                  <td className="text-center py-1.5 px-2 tabular-nums text-ink-500">{r.s20}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2.5 text-caption text-ink-500 leading-relaxed">
            「執行良好」包括：① 優於規定（如驗證範圍涵蓋全機關）；② 對檢核項目要求執行完整確實（如資安績效指標完整且高標準）；③ 記錄完整（相關執行紀錄如期如實表現）。
          </p>
        </div>
      </details>

      <div className="rounded-md border border-rule overflow-hidden">
        {ASPECTS.map((aspect) => {
          const focused = focusSet.has(aspect);
          const collapsed = collapsedAspects.has(aspect);
          // 收合列摘要:本構面已評 X/共 Y 項(讓委員收合時仍一眼知道分佈、要不要展開)
          const aspectDims = ASPECT_DIMENSIONS[aspect];
          const aspectScored = aspectDims.filter((d) => scores[d] != null).length;
          return (
          <div key={aspect}>
            <button
              type="button"
              onClick={() => toggleAspect(aspect)}
              aria-expanded={!collapsed}
              className={`w-full px-5 py-2.5 text-label border-b border-rule flex items-center gap-2 transition-colors focus-ring ${focused ? 'bg-focus-wash text-primary-700 hover:bg-focus-wash/70' : 'bg-paper-sunk text-ink-500 hover:bg-paper-sunk/70'}`}
            >
              <ChevronDown size={16} className={`shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
              {DEFICIENCY_ASPECT_LABELS[aspect]}
              {focused && <Chip size="sm" tone="primary">您負責</Chip>}
              <span className="ml-auto text-caption text-ink-500 tabular-nums font-normal">
                已評 {aspectScored}/{aspectDims.length} 項{collapsed ? ' · 點此展開' : ''}
              </span>
            </button>
            {!collapsed && ASPECT_DIMENSIONS[aspect].map((dim) => {
              const st = stats[dim] ?? { total: 0, c1: 0, c2: 0, c3: 0, c4: 0 };
              const v = scores[dim] ?? null;
              const issues = dimIssues[dim] ?? [];
              // 等第色條:已評分的構面列以左側色條映射等第(優/良/佳/可/待改進),掃一眼即知分佈。
              // 批82:刪本地 GRADE_BAR map,改由 stage.ts toneClasses(單一來源,與缺失列/矩陣同語彙)派生左框色。
              const gradeBar = v !== null ? toneClasses(GRADE_TONE[gradeOf(dim, v)]).border : 'border-l-transparent';
              return (
                <div key={dim} className={`border-b border-rule last:border-b-0 bg-card px-5 py-3.5 border-l-[3px] transition-colors ${gradeBar}`}>
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-body text-ink-900">
                      {/* DIMENSION_LABELS 已含「一、」前綴,勿再加 DIMENSION_NUM(原本重複成「一、一、」) */}
                      {DIMENSION_LABELS[dim]}
                      <span className="text-ink-500">({DIMENSION_MAX_SCORE[dim]} 分）</span>
                      {/* 以項目數量評分,於標題標示本構面共幾項,方便委員判定數量 */}
                      {st.total > 0 && <span className="text-ink-500">・共 {st.total} 項</span>}
                    </div>
                    <div className="text-caption text-ink-500 mt-1 leading-relaxed">{gradeHint(dim)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* 自繪 −/＋ 級進器:取代原生 number spinner(原生 spinner 點一下會卷動、無法連續按) */}
                    <div className="inline-flex items-center rounded-md border border-neutral-400 bg-card overflow-hidden transition-colors focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-200">
                      <button
                        type="button"
                        aria-label={`${DIMENSION_LABELS[dim]} 減一分`}
                        disabled={!canEdit || (v ?? 0) <= 0}
                        onClick={() => setScore(dim, String((v ?? 0) - 1))}
                        className="w-11 h-11 flex items-center justify-center text-title text-ink-500 hover:bg-paper-sunk disabled:opacity-40 focus-ring"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={DIMENSION_MAX_SCORE[dim]}
                        value={v ?? ''}
                        onChange={(e) => setScore(dim, e.target.value)}
                        disabled={!canEdit}
                        aria-label={`${DIMENSION_LABELS[dim]} 評分（0-${DIMENSION_MAX_SCORE[dim]})`}
                        className="w-12 h-11 border-x border-neutral-400 bg-card px-1 text-body text-center tabular-nums focus-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:bg-paper-sunk disabled:text-ink-500"
                      />
                      <button
                        type="button"
                        aria-label={`${DIMENSION_LABELS[dim]} 加一分`}
                        disabled={!canEdit || (v ?? 0) >= DIMENSION_MAX_SCORE[dim]}
                        onClick={() => setScore(dim, String((v ?? 0) + 1))}
                        className="w-11 h-11 flex items-center justify-center text-title text-ink-500 hover:bg-paper-sunk disabled:opacity-40 focus-ring"
                      >
                        ＋
                      </button>
                    </div>
                    <span className="w-14">
                      {v !== null && (
                        <Chip size="sm" tone={GRADE_TONE[gradeOf(dim, v)]}>{gradeOf(dim, v)}</Chip>
                      )}
                    </span>
                  </div>
                </div>
                {/* 委員手填檢核結果數量(預設空白);機關自評僅供參考,不自動帶入 */}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-caption text-ink-500">委員判定數量：</span>
                  {COUNT_FIELDS.map(({ key, label }) => (
                    <label key={key} className="inline-flex items-center gap-1 text-caption text-ink-500">
                      {label}
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={counts[dim]?.[key] ?? ''}
                        onChange={(e) => setCount(dim, key, e.target.value)}
                        disabled={!canEdit}
                        aria-label={`${DIMENSION_LABELS[dim]} ${label} 題數`}
                        className="w-12 h-11 rounded-md border border-neutral-400 bg-card px-1 text-body-sm text-center tabular-nums focus-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:bg-paper-sunk disabled:text-ink-500"
                      />
                    </label>
                  ))}
                  <span className="text-caption text-ink-500">
                    機關自評供參：{st.total} 題（符{st.c1}/部{st.c2}/不{st.c3}/適{st.c4})
                  </span>
                  {/* 即時合計回饋:動筆後合計≠題數標紅(唯讀改中性描述);送出被擋的構面常駐標紅到修正為止 */}
                  {(() => {
                    if (problemByDim[dim] && canEdit) {
                      return <span className="text-caption font-medium text-danger-600">{problemByDim[dim]}</span>;
                    }
                    const sum = countSum(dim);
                    if (sum === null) return null;
                    if (sum === st.total) {
                      return <span className="text-caption text-success-700 tabular-nums">合計 {sum}/{st.total} ✓</span>;
                    }
                    // 唯讀(已鎖定/結案)顯示描述句而非命令句——舊資料無法就地修改,紅色命令只會製造兩難
                    return canEdit ? (
                      <span className="text-caption font-medium text-danger-600 tabular-nums">合計 {sum}/{st.total}，須等於題數</span>
                    ) : (
                      <span className="text-caption text-ink-500 tabular-nums">合計 {sum}/{st.total}，與題數不符</span>
                    );
                  })()}
                </div>
                {issues.length > 0 && (
                  <details className="px-5 pb-3">
                    <summary className="cursor-pointer text-caption text-ink-500 hover:underline select-none">
                      參考—查看審閱意見（{issues.length} 項部分符合/不符合）
                    </summary>
                    <p className="mt-2 text-caption text-ink-500 leading-relaxed">
                      以下為實地稽核前之審閱筆記，僅供參考；經現場稽核後可能有異動，委員判定數量請依現場結果填寫，不受此限。
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {issues.map((it) => (
                        <li key={it.itemNo} className="flex gap-2 text-caption text-ink-500">
                          <Chip size="sm" tone={it.level === 'NON_COMPLIANT' ? 'danger' : 'warning'} className="shrink-0 font-mono">{it.itemNo}</Chip>
                          <span className="leading-relaxed">{it.content}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                </div>
              );
            })}
          </div>
          );
        })}
        <div className="flex items-center justify-end gap-3 px-5 py-3 bg-paper-sunk">
          <span className="text-body-sm text-ink-500">您的評分小計（已評 {filledCount} 項）</span>
          <span className="text-title-lg text-ink-900 tabular-nums">{filledCount === 0 ? '—' : myTotal}</span>
        </div>
      </div>
    </section>
  );
}

// ───────────────── 稽核發現 ───────────────────

type DraftFinding = { aspect: DeficiencyAspect; content: string; checklistRef: string };

function FindingSection({
  cycleId, canEdit, practice = false, itemContent, itemLaw, dimIssues, snippets, focusAspects = [], initialFindings, unsavedFindingsRef,
}: {
  cycleId: string;
  canEdit: boolean;
  practice?: boolean;
  itemContent: Record<string, string>;
  itemLaw: Record<string, ItemLaw>;
  dimIssues: Record<string, DimIssue[]>;
  snippets: FindingSnippetDTO[];
  /** 委員受指派的評分構面;新發現的構面預設取第一個(否則 STRATEGY) */
  focusAspects?: DeficiencyAspect[];
  initialFindings: MyFinding[];
  unsavedFindingsRef: MutableRefObject<() => boolean>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [findings, setFindings] = useState<MyFinding[]>(initialFindings);
  // saveAllDirty 讀最新 findings(避免 async 迴圈讀到 stale 快照覆蓋並行編輯)+ 同步重入鎖(防雙擊/與單列儲存並行)
  const findingsRef = useRef(findings);
  useEffect(() => { findingsRef.current = findings; }, [findings]);
  const savingRef = useRef(false);
  const [drafts, setDrafts] = useState<Partial<Record<FindingKind, DraftFinding>>>({});
  const [busy, setBusy] = useState<string | null>(null); // finding id 或 `new:KIND`
  const [deleting, setDeleting] = useState<MyFinding | null>(null);
  // 練習模式:發現 CRUD 改打 practice-* 端點(獨立 PracticeFinding 表;請求/回應契約與正式端點相容)
  const findingsUrl = practice ? `/api/cycles/${cycleId}/practice-findings` : `/api/cycles/${cycleId}/audit/findings`;
  const findingUrl = (id: string) => (practice ? `/api/practice-findings/${id}` : `/api/audit-findings/${id}`);
  // 法規對照 Dialog:依輸入之對應項次展開該檢核項的稽核依據
  const [lawRef, setLawRef] = useState<string | null>(null);
  // 剪貼簿 Dialog:依當前構面/類型篩選片語,點選插入發現內容(插入於游標所在處)
  const [clip, setClip] = useState<{ aspect: DeficiencyAspect; kind: FindingKind; insert: (snippet: string) => void } | null>(null);
  const [clipShowAll, setClipShowAll] = useState(false); // 剪貼簿:false=只看符合當前構面/類型,true=全部
  // 各發現內容 textarea 的 DOM 參照(key=既有發現 f.id 或 `draft:KIND`),供剪貼簿插入於游標處
  const taRefs = useRef<Map<string, HTMLTextAreaElement | null>>(new Map());

  // 發現列共用的兩個輔助鈕(法規對照 + 剪貼簿);ref 取對應項次,taKey 對應 textarea,setContent 寫回內容。
  function helperButtons(
    ref: string,
    aspect: DeficiencyAspect,
    kind: FindingKind,
    taKey: string,
    setContent: (next: string) => void,
  ) {
    return (
      <>
        <Button
          size="sm" variant="text" leadingIcon={<FileText size={14} />}
          onClick={() => {
            const r = ref.trim();
            if (!r) { toast.info('請先填寫對應項次', '法規對照會依對應項次展開該檢核項的稽核依據。'); return; }
            setLawRef(r);
          }}
        >法規對照</Button>
        <Button
          size="sm" variant="text" leadingIcon={<ClipboardCheck size={14} />}
          onClick={() => {
            setClipShowAll(false); // 每次開啟預設「符合當前構面/類型」
            // 按下當下擷取該 textarea 的游標位置與內容(對話框開啟後內容不再變動)
            const ta = taRefs.current.get(taKey);
            const content = ta?.value ?? '';
            const start = ta?.selectionStart ?? content.length;
            const end = ta?.selectionEnd ?? content.length;
            setClip({
              aspect, kind,
              insert: (snippet: string) => {
                setContent(content.slice(0, start) + snippet + content.slice(end));
                // 還原焦點並把游標移到插入文字之後(等下一次繪製後再設定)
                requestAnimationFrame(() => {
                  const el = taRefs.current.get(taKey);
                  if (el) { el.focus(); const pos = start + snippet.length; el.setSelectionRange(pos, pos); }
                });
              },
            });
          }}
        >剪貼簿</Button>
      </>
    );
  }

  // 離開保護:編輯中未存的發現(editedRef)或有內容的草稿(draftDirtyRef)→ 關分頁攔截
  const editedRef = useRef<Set<string>>(new Set());
  const draftDirtyRef = useRef(false);
  // 建立中的草稿 kind:createFinding 進行中→卸載 flush 跳過,避免同一草稿被 createFinding + flush 雙送重複建立(批51 專審 P2)
  const creatingKindsRef = useRef<Set<FindingKind>>(new Set());
  useEffect(() => {
    draftDirtyRef.current = Object.values(drafts).some(
      (d) => (d?.content?.trim().length ?? 0) > 0 || (d?.checklistRef?.trim().length ?? 0) > 0,
    );
  }, [drafts]);
  // 向父層註冊「是否有未儲存的發現編輯」,供 ScoreSection 鎖定前檢查
  useEffect(() => {
    unsavedFindingsRef.current = () => editedRef.current.size > 0 || draftDirtyRef.current;
  }, [unsavedFindingsRef]);
  useEffect(() => {
    if (!canEdit) return;
    const h = (e: BeforeUnloadEvent) => {
      if (editedRef.current.size > 0 || draftDirtyRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [canEdit]);
  // 卸載搶救(批51):就地切換週期分頁/關頁時,盡力補送「編輯中未存的既有發現」與「內容夠長的草稿」。
  // 就地切換不觸發 beforeunload,故此處以 keepalive 補送;flushRef.current 每次繪製重指以讀到最新 drafts。
  const flushRef = useRef<() => void>(() => {});
  flushRef.current = () => {
    if (!canEdit) return;
    // 既有發現:編輯過(editedRef)者以最新內容 PATCH
    for (const id of editedRef.current) {
      const f = findingsRef.current.find((x) => x.id === id);
      if (!f) continue;
      try {
        fetch(findingUrl(f.id), {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ aspect: f.aspect, content: toFullWidthPunct(f.content), checklistRef: f.checklistRef }),
          keepalive: true,
        }).catch(() => {});
      } catch { /* 盡力搶救;失敗不阻斷卸載 */ }
    }
    // 未新增的草稿:內容 trim 長度 ≥ 5(與 createFinding 同門檻)者 POST 建立,避免剛打的草稿靜默消失
    for (const [kind, d] of Object.entries(drafts)) {
      if (!d || d.content.trim().length < 5) continue;
      if (creatingKindsRef.current.has(kind as FindingKind)) continue; // createFinding 送出中,勿重複建立
      try {
        fetch(findingsUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            aspect: d.aspect,
            kind,
            content: toFullWidthPunct(d.content.trim()),
            checklistRef: d.checklistRef.trim() || undefined,
          }),
          keepalive: true,
        }).catch(() => {});
      } catch { /* 盡力搶救;失敗不阻斷卸載 */ }
    }
  };
  useEffect(() => () => flushRef.current(), []);

  function openDraft(kind: FindingKind) {
    // 預設構面取委員受指派的第一個構面(如管理面);未指派則沿用 STRATEGY
    const defaultAspect: DeficiencyAspect = focusAspects[0] ?? 'STRATEGY';
    setDrafts((d) => ({ ...d, [kind]: d[kind] ?? { aspect: defaultAspect, content: '', checklistRef: '' } }));
  }

  async function createFinding(kind: FindingKind) {
    const draft = drafts[kind];
    if (!draft || draft.content.trim().length < 5) {
      toast.error('內容太短', '稽核發現至少 5 字。');
      return;
    }
    creatingKindsRef.current.add(kind);
    setBusy(`new:${kind}`);
    const res = await fetch(findingsUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        aspect: draft.aspect,
        kind,
        content: toFullWidthPunct(draft.content.trim()),
        checklistRef: draft.checklistRef.trim() || undefined,
      }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '新增失敗' }));
      toast.error('新增失敗', j.error);
      return;
    }
    const created = await res.json();
    setFindings((f) => [...f, {
      id: created.id, aspect: created.aspect, kind: created.kind,
      content: created.content, checklistRef: created.checklistRef, locked: false,
    }]);
    setDrafts((d) => { const n = { ...d }; delete n[kind]; return n; });
    creatingKindsRef.current.delete(kind);
  }

  // 從不符合/部分符合題一鍵帶成發現草稿。委員回饋:一律帶入「待改善事項」會造成困擾,
  // 故帶入前由委員自選「待改善事項」或「建議事項」(kind),再補述後儲存。
  async function importFinding(itemNo: string, dim: string, kind: 'IMPROVE' | 'SUGGEST') {
    // 委員開立待改善/建議事項時只述「缺失/不符或風險之處」,不給改善建議(批44),故佔位文字不含「及改善建議」。
    // 仍保留「(請補述」前綴——批36 convert 佔位閘以 /[(（]請補述/ 偵測未補述者,不可拿掉此前綴。
    const placeholder = kind === 'SUGGEST'
      ? '（請補述建議事項：無法規要求但存有資安風險之處）'
      : '（請補述具體缺失或不符之處）';
    setBusy(`import:${kind}:${itemNo}`);
    const res = await fetch(findingsUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        // 構面依檢核項維度對應;維度未解析時預設為「本委員負責構面」而非一律技術面——
        // 原 ?? 'TECHNICAL' 會把管理/策略委員帶入的發現靜默塞進技術面(該構面空、技術面看似重複;批48 圖5)。
        aspect: DIM_TO_ASPECT[dim] ?? focusAspects[0] ?? 'STRATEGY',
        kind,
        // 只帶入對應項次(checklistRef);發現內容留給委員自行撰寫,不預先述明檢核表題目
        // (委員回饋:自動代入只需項次;題目已由下方「對應檢核項」摘要就地顯示,不必塞進內容)。
        content: toFullWidthPunct(placeholder),
        checklistRef: itemNo,
      }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '帶入失敗' }));
      toast.error('帶入失敗', j.error);
      return;
    }
    const created = await res.json();
    setFindings((f) => [...f, {
      id: created.id, aspect: created.aspect, kind: created.kind,
      content: created.content, checklistRef: created.checklistRef, locked: false,
    }]);
    toast.success(`已帶入${FINDING_KIND_LABELS[kind]}（待補述）`, '此發現已建立，請於下方補述具體內容後儲存；未補述前僅為佔位。');
  }

  async function patchFinding(f: MyFinding) {
    if (savingRef.current) return; // 不與其他儲存(單列/全部)並行
    savingRef.current = true;
    setBusy(f.id);
    try {
      const res = await fetch(findingUrl(f.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aspect: f.aspect, content: toFullWidthPunct(f.content), checklistRef: f.checklistRef }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: '儲存失敗' }));
        toast.error('儲存失敗', j.error);
        return;
      }
      editedRef.current.delete(f.id);
      toast.success('已儲存發現');
    } finally {
      savingRef.current = false;
      setBusy(null);
    }
  }

  async function deleteFinding(f: MyFinding) {
    setBusy(f.id);
    const res = await fetch(findingUrl(f.id), { method: 'DELETE' });
    setBusy(null);
    setDeleting(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '刪除失敗' }));
      toast.error('刪除失敗', j.error);
      return;
    }
    editedRef.current.delete(f.id);
    setFindings((all) => all.filter((x) => x.id !== f.id));
    router.refresh();
  }

  function mutate(id: string, patch: Partial<MyFinding>) {
    editedRef.current.add(id);
    setFindings((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  // 一鍵依「對應項次」排序(法遵符合/待改善/建議各自按項次;無項次者排最後)。
  // 僅調整顯示順序;彙整報告與列印另於 buildReportData 一律排序,兩處一致。
  function sortByRef() {
    setFindings((all) =>
      [...all].sort(
        (a, b) =>
          KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
          compareChecklistRef(a.checklistRef, b.checklistRef),
      ),
    );
    toast.success('已依項次排序', '各類發現已依對應項次排列。');
  }

  // 底部「全部儲存」:一次送出所有有編輯過(editedRef)的既有發現(草稿仍用「新增此條」)。
  async function saveAllDirty() {
    if (savingRef.current) return; // 同步重入鎖:防雙擊,且不與單列儲存並行
    const dirtyIds = Array.from(editedRef.current);
    if (dirtyIds.length === 0) {
      toast.info('無待儲存項目', '目前沒有未儲存的發現編輯。');
      return;
    }
    savingRef.current = true;
    setBusy('save-all');
    let ok = 0;
    try {
      for (const id of dirtyIds) {
        const f = findingsRef.current.find((x) => x.id === id); // 讀最新狀態,避免覆蓋使用者並行編輯
        if (!f) { editedRef.current.delete(id); continue; }
        const res = await fetch(findingUrl(id), {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ aspect: f.aspect, content: toFullWidthPunct(f.content), checklistRef: f.checklistRef }),
        });
        if (res.ok) { editedRef.current.delete(id); ok++; }
      }
    } finally {
      savingRef.current = false;
      setBusy(null);
    }
    if (ok === dirtyIds.length) toast.success('已全部儲存', `共儲存 ${ok} 條發現。`);
    else toast.error('部分儲存失敗', `已儲存 ${ok}/${dirtyIds.length} 條，請逐條檢查未儲存項目。`);
  }

  return (
    <section>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="刪除這條稽核發現？"
        description={deleting ? `「${deleting.content.slice(0, 60)}${deleting.content.length > 60 ? '…' : ''}」將被刪除，無法復原。` : undefined}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={() => { if (deleting) void deleteFinding(deleting); }}
        loading={busy === deleting?.id}
      />

      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <h2 className="text-title-lg text-ink-900">稽核發現</h2>
      </div>
      <p className="text-body-sm text-ink-500 mb-1">
        {practice
          ? '逐條輸入您的練習發現；僅供指導委員與中心檢視回饋，不會進入正式報告。'
          : '逐條輸入您的發現；全體委員的發現會自動彙整至報告。'}
      </p>
      <p className="text-caption text-ink-500 mb-4">
        發現需按「儲存」，不會自動存檔。
      </p>

      {/* pm-06:從檢核表不符合/部分符合題一鍵帶入發現草稿,免重打。
          委員回饋:帶入前自選「待改善事項」或「建議事項」,不再一律帶入待改善。 */}
      {canEdit && (() => {
        const issues = Object.entries(dimIssues).flatMap(([dim, items]) => items.map((it) => ({ ...it, dim })));
        if (issues.length === 0) return null;
        return (
          <details className="mb-4 rounded-md border border-rule bg-card overflow-hidden">
            <summary className="cursor-pointer select-none px-4 py-3 text-body-sm font-medium text-ink-900 hover:bg-paper-sunk">
              從檢核表「部分符合/不符合」題帶入發現（{issues.length})
            </summary>
            <p className="px-4 pt-3 text-caption text-ink-500 leading-relaxed">
              選擇要帶入為「待改善事項」或「建議事項」；帶入後僅含對應項次，請於下方補述內容。
            </p>
            <ul className="divide-y divide-rule">
              {issues.map((it) => (
                <li key={it.itemNo} className="flex items-start gap-3 px-4 py-3">
                  <Chip size="sm" tone={it.level === 'NON_COMPLIANT' ? 'danger' : 'warning'} className="shrink-0 font-mono">{it.itemNo}</Chip>
                  <span className="flex-1 min-w-0 text-body-sm text-ink-500 leading-relaxed">{it.content}</span>
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    <Button
                      size="sm"
                      variant="tonal"
                      loading={busy === `import:IMPROVE:${it.itemNo}`}
                      onClick={() => importFinding(it.itemNo, it.dim, 'IMPROVE')}
                    >
                      帶入待改善
                    </Button>
                    <Button
                      size="sm"
                      variant="text"
                      loading={busy === `import:SUGGEST:${it.itemNo}`}
                      onClick={() => importFinding(it.itemNo, it.dim, 'SUGGEST')}
                    >
                      帶入建議
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        );
      })()}

      <div className="flex flex-col gap-5">
        {KINDS.map((kind) => {
          const mine = findings.filter((f) => f.kind === kind);
          const draft = drafts[kind];
          return (
            <div key={kind} id={`finding-kind-${kind}`} className="rounded-md border border-rule bg-card scroll-mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-rule">
                <div>
                  <span className="text-title text-ink-900">{FINDING_KIND_LABELS[kind]}</span>
                  <span className="ml-2 text-caption text-ink-500">{FINDING_KIND_HINTS[kind]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Chip size="sm" tone="neutral">{mine.length} 條</Chip>
                  {canEdit && !draft && (
                    <Button size="sm" variant="tonal" leadingIcon={<Plus size={14} />} onClick={() => openDraft(kind)}>
                      新增
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-col divide-y divide-rule">
                {mine.length === 0 && !draft && (
                  <div className="px-5 py-4 text-body-sm text-ink-500">尚無內容</div>
                )}
                {mine.map((f) => (
                  <div key={f.id} className="px-5 py-4 flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <AspectSelect
                        value={f.aspect}
                        disabled={!canEdit || f.locked}
                        onChange={(aspect) => mutate(f.id, { aspect })}
                      />
                      <RefChips
                        value={f.checklistRef ?? ''}
                        disabled={!canEdit || f.locked}
                        onChange={(next) => mutate(f.id, { checklistRef: next })}
                      />
                      {canEdit && !f.locked && (f.checklistRef ?? '').trim() !== '' && (
                        <Button size="sm" variant="text" onClick={() => mutate(f.id, { checklistRef: '' })}>
                          清除項次
                        </Button>
                      )}
                      {canEdit && !f.locked && helperButtons(
                        f.checklistRef ?? '', f.aspect, f.kind,
                        f.id, (next) => mutate(f.id, { content: next }),
                      )}
                      {f.locked && <Chip size="sm" tone="primary" dot>已轉入缺失管考</Chip>}
                      <div className="flex-1" />
                      {canEdit && !f.locked && (
                        <>
                          <Button size="sm" variant="text" onClick={() => setDeleting(f)}>刪除</Button>
                          <Button size="sm" variant="tonal" loading={busy === f.id} onClick={() => patchFinding(f)}>
                            儲存
                          </Button>
                        </>
                      )}
                    </div>
                    {/* A5:即時顯示所引項次的題目摘要(支援多項次),避免引錯項次 */}
                    <RefSummary refStr={f.checklistRef ?? ''} itemContent={itemContent} />
                    <Textarea
                      label="發現內容"
                      ref={(el) => { taRefs.current.set(f.id, el); }}
                      value={f.content}
                      onChange={(e) => mutate(f.id, { content: e.target.value })}
                      onBlur={(e) => { const v = toFullWidthPunct(e.target.value); if (v !== f.content) mutate(f.id, { content: v }); }}
                      disabled={!canEdit || f.locked}
                      rows={3}
                    />
                  </div>
                ))}

                {canEdit && draft && (
                  <div className={`px-5 py-4 flex flex-col gap-2.5 ${SURFACE_INFO}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <AspectSelect
                        value={draft.aspect}
                        onChange={(aspect) => setDrafts((d) => ({ ...d, [kind]: { ...draft, aspect } }))}
                      />
                      <RefChips
                        value={draft.checklistRef}
                        onChange={(next) => setDrafts((d) => ({ ...d, [kind]: { ...draft, checklistRef: next } }))}
                      />
                      {draft.checklistRef.trim() !== '' && (
                        <Button size="sm" variant="text" onClick={() => setDrafts((d) => ({ ...d, [kind]: { ...draft, checklistRef: '' } }))}>
                          清除項次
                        </Button>
                      )}
                      {helperButtons(
                        draft.checklistRef, draft.aspect, kind,
                        `draft:${kind}`,
                        (next) => setDrafts((d) => {
                          const cur = d[kind];
                          if (!cur) return d;
                          return { ...d, [kind]: { ...cur, content: next } };
                        }),
                      )}
                      <div className="flex-1" />
                      <Button
                        size="sm" variant="text"
                        onClick={() => setDrafts((d) => { const n = { ...d }; delete n[kind]; return n; })}
                      >
                        取消
                      </Button>
                      <Button size="sm" loading={busy === `new:${kind}`} onClick={() => createFinding(kind)}>
                        新增此條
                      </Button>
                    </div>
                    {/* 即時顯示對應檢核項摘要(填好對應項次即顯示,不必等儲存;支援多項次) */}
                    <RefSummary refStr={draft.checklistRef} itemContent={itemContent} />
                    <Textarea
                      label="發現內容（可直接從 Word 貼上）"
                      ref={(el) => { taRefs.current.set(`draft:${kind}`, el); }}
                      value={draft.content}
                      onChange={(e) => setDrafts((d) => ({ ...d, [kind]: { ...draft, content: e.target.value } }))}
                      onBlur={(e) => { const v = toFullWidthPunct(e.target.value); if (v !== draft.content) setDrafts((d) => ({ ...d, [kind]: { ...draft, content: v } })); }}
                      rows={3}
                      placeholder="例：依資通安全管理法第 9 條規定…，惟查…"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部操作列:全部填完後一鍵排序 / 全部儲存(取代原本置於標頭的排序鈕) */}
      {findings.length > 0 && (
        <div className="mt-5 pt-4 border-t border-rule flex flex-wrap items-center justify-end gap-2">
          {findings.length > 1 && (
            <Button size="sm" variant="text" onClick={sortByRef}>依項次排序</Button>
          )}
          {canEdit && (
            <Button size="sm" variant="tonal" loading={busy === 'save-all'} onClick={saveAllDirty}>全部儲存</Button>
          )}
        </div>
      )}

      {/* 法規對照(項4):依對應項次展開該檢核項之稽核依據/重點/應備文件 */}
      <Dialog
        open={lawRef !== null}
        onOpenChange={(o) => !o && setLawRef(null)}
        size="lg"
        title={lawRef ? `法規對照 · 項次 ${lawRef}` : '法規對照'}
      >
        {lawRef && (() => {
          const refs = parseRefs(lawRef);
          return (
            <div className="flex flex-col gap-5">
              {refs.map((r) => (
                <div key={r}>
                  {refs.length > 1 && <p className="text-label text-primary-800 mb-2">項次 {r}</p>}
                  {itemLaw[r] ? (
                    <LawPanel
                      auditBasis={itemLaw[r].auditBasis}
                      auditFocus={itemLaw[r].auditFocus}
                      expectedEvidence={itemLaw[r].expectedEvidence}
                    />
                  ) : (
                    <p className="text-body-sm text-ink-500 py-2">查無項次「{r}」的法規對照資料，請確認項次編號。</p>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </Dialog>

      {/* 剪貼簿(項5):緊湊片語清單,點選插入游標處;預設依當前構面/類型篩選,可切換全部 */}
      {clip && (() => {
        const matched = snippets.filter((s) => snippetMatches(s, clip.aspect, clip.kind));
        const shown = clipShowAll ? snippets : matched;
        const toggleCls = (active: boolean) =>
          `inline-flex items-center min-h-8 [@media(pointer:coarse)]:min-h-11 px-3 rounded-full text-label-sm tabular-nums transition-colors ${
            active ? 'bg-focus-wash text-primary-700 font-medium' : 'text-ink-500 hover:bg-paper-sunk'
          }`;
        return (
          <Dialog
            open
            onOpenChange={(o) => !o && setClip(null)}
            size="lg"
            title="剪貼簿 — 插入常用發現片語"
            description="點選片語即插入「發現內容」游標所在處。"
          >
            {snippets.length === 0 ? (
              <p className="text-body-sm text-ink-500 py-2">尚無片語。請最高管理員至「管理 → 發現片語庫」新增。</p>
            ) : (
              <>
                {/* 篩選切換:符合目前構面/類型 ↔ 全部 */}
                <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                  <button type="button" onClick={() => setClipShowAll(false)} className={toggleCls(!clipShowAll)}>
                    符合此構面/類型 {matched.length}
                  </button>
                  <button type="button" onClick={() => setClipShowAll(true)} className={toggleCls(clipShowAll)}>
                    全部 {snippets.length}
                  </button>
                </div>
                {shown.length === 0 ? (
                  <p className="text-body-sm text-ink-500 py-2">此構面/類型尚無對應片語；可切換「全部」，或至「發現片語庫」新增/設為通用。</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {shown.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        title={s.text}
                        onClick={() => { clip.insert(s.text); setClip(null); toast.success('已插入片語'); }}
                        className="text-left rounded-md border border-neutral-400 bg-card hover:bg-paper-sunk hover:border-primary-300 transition-colors px-2.5 py-1.5 text-body-sm text-ink-500 max-w-[18rem]"
                      >
                        <span className="line-clamp-2 break-words whitespace-pre-wrap">{s.text}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </Dialog>
        );
      })()}
    </section>
  );
}

/**
 * 對應項次輸入:每個項次一個可刪 chip + 「新增」輸入;自動依項次排序(如先填 6.7 後 6.6 → 顯示 6.6、6.7)。
 * 內部以「、」連接的字串存於 checklistRef(沿用既有資料格式),sortRefsString 保證去重+排序。
 */
function RefChips({ value, onChange, disabled }: { value: string; onChange: (next: string) => void; disabled?: boolean }) {
  const refs = sortRefs(value);
  const [input, setInput] = useState('');
  function add() {
    const r = input.trim();
    if (!r) return;
    onChange(sortRefsString([...refs, r].join('、')));
    setInput('');
  }
  return (
    <div className="flex flex-col gap-0.5 min-w-[10rem]">
      <span className="text-caption text-ink-500 px-1">對應項次（選填）</span>
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-neutral-400 bg-card px-2 py-1 min-h-9 [@media(pointer:coarse)]:min-h-11">
        {refs.map((r) => (
          <span key={r} className="inline-flex items-center gap-1 rounded-full bg-paper-sunk px-2 py-0.5 text-caption text-ink-900">
            {r}
            {!disabled && (
              <button type="button" aria-label={`移除 ${r}`} onClick={() => onChange(sortRefsString(refs.filter((x) => x !== r).join('、')))} className="text-ink-500 hover:text-danger-700 leading-none">×</button>
            )}
          </span>
        ))}
        {!disabled && (
          <span className="inline-flex items-center gap-0.5">
            <input
              list="audit-item-refs"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
              placeholder="項次"
              className="w-14 h-6 [@media(pointer:coarse)]:h-10 bg-transparent text-caption outline-none placeholder:text-ink-500"
            />
            <button type="button" onClick={add} className="text-caption text-primary-700 whitespace-nowrap">+ 新增</button>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * 對應檢核項即時摘要(委員填/選對應項次當下就顯示,不必等儲存)。
 * 支援多項次(如「5.2、5.9」):逐項顯示題目摘要;無此項次者逐項提示確認編號。
 */
function RefSummary({ refStr, itemContent }: { refStr: string; itemContent: Record<string, string> }) {
  const refs = sortRefs(refStr);
  if (refs.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {refs.map((r) =>
        itemContent[r] ? (
          <p key={r} className="text-caption text-ink-500 leading-relaxed bg-paper-sunk rounded-sm px-3 py-1.5">
            對應檢核項【{r}】{itemContent[r]}
          </p>
        ) : (
          <p key={r} className="text-caption text-warning-700">查無檢核項次「{r}」，請確認編號</p>
        ),
      )}
    </div>
  );
}

function AspectSelect({
  value, onChange, disabled,
}: {
  value: DeficiencyAspect;
  onChange: (a: DeficiencyAspect) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as DeficiencyAspect)}
      disabled={disabled}
      aria-label="稽核構面"
      className="h-10 [@media(pointer:coarse)]:h-11 rounded-md border border-neutral-400 bg-card px-3 text-body-sm focus-ring disabled:bg-paper-sunk disabled:text-ink-500"
    >
      {ASPECTS.map((a) => (
        <option key={a} value={a}>{DEFICIENCY_ASPECT_LABELS[a]}</option>
      ))}
    </select>
  );
}
