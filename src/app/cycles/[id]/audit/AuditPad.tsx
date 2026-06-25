'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Textarea } from '@/components/ui/Textarea';
import { TextField } from '@/components/ui/TextField';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { SaveStatus } from '@/components/ui/SaveStatus';
import { useToast } from '@/components/ui/Toast';
import { Plus, Check } from '@/components/icons';
import { DIMENSION_LABELS } from '@/lib/dimension';
import { DEFICIENCY_ASPECT_LABELS, type DeficiencyAspect, type Dimension } from '@/lib/types';
import {
  ASPECT_DIMENSIONS, DIMENSION_MAX_SCORE,
  gradeOf, gradeHint, GRADE_TONE, compareChecklistRef,
  FINDING_KIND_LABELS, FINDING_KIND_HINTS, type FindingKind,
} from '@/lib/audit-score';

export type DimStat = { total: number; c1: number; c2: number; c3: number; c4: number };
export type DimIssue = { itemNo: string; content: string; level: string };
export type MyFinding = {
  id: string;
  aspect: DeficiencyAspect;
  kind: FindingKind;
  content: string;
  checklistRef: string | null;
  locked: boolean;
};

const ASPECTS: DeficiencyAspect[] = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'];
const KINDS: FindingKind[] = ['COMPLIANCE', 'IMPROVE', 'SUGGEST'];
// 構面(九)→ 缺失構面(三):從不符合題帶入發現時自動歸構面
const DIM_TO_ASPECT: Record<string, DeficiencyAspect> = {};
for (const a of ASPECTS) for (const dim of ASPECT_DIMENSIONS[a]) DIM_TO_ASPECT[dim] = a;

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
  stats,
  itemRefs,
  itemContent = {},
  dimIssues = {},
  assignedLabels = [],
  focusAspects = [],
  initialScores,
  initialFindings,
}: {
  cycleId: string;
  canEdit: boolean;
  /** 委員已「確認填寫完畢」鎖定 → 唯讀,顯示「解除鎖定」 */
  locked?: boolean;
  stats: Record<string, DimStat>;
  itemRefs: string[];
  itemContent?: Record<string, string>;
  dimIssues?: Record<string, DimIssue[]>;
  /** 指派的負責構面標籤(三構面四類);空 = 未指定(全構面) */
  assignedLabels?: string[];
  /** 對應的評分構面(3 aspect),用於評分表聚焦標示 */
  focusAspects?: DeficiencyAspect[];
  initialScores: Record<string, number>;
  initialFindings: MyFinding[];
}) {
  // 鎖定前需確認「稽核發現」沒有未儲存的編輯(兩個子元件不共享 state,以此 ref 橋接)。
  const unsavedFindingsRef = useRef<() => boolean>(() => false);
  return (
    <div className="flex flex-col gap-8">
      {/* 對應檢核項次建議清單(委員輸入時下拉選 7.4 等有效項次) */}
      <datalist id="audit-item-refs">
        {itemRefs.map((r) => <option key={r} value={r} />)}
      </datalist>
      {assignedLabels.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-md border border-primary-200 bg-primary-50 px-4 py-3 text-body-sm text-primary-800">
          <Check size={16} className="mt-0.5 shrink-0" />
          <span>
            您本次負責構面:<span className="font-medium">{assignedLabels.join('、')}</span>
            。評分表已標示您負責的構面;其餘構面如非您職責可略過(未評的不計入您的小計)。
          </span>
        </div>
      )}
      <ScoreSection cycleId={cycleId} canEdit={canEdit} locked={locked} stats={stats} dimIssues={dimIssues} focusAspects={focusAspects} initialScores={initialScores} unsavedFindingsRef={unsavedFindingsRef} />
      <FindingSection cycleId={cycleId} canEdit={canEdit} itemContent={itemContent} dimIssues={dimIssues} initialFindings={initialFindings} unsavedFindingsRef={unsavedFindingsRef} />
    </div>
  );
}

// ───────────────── 評分表 ─────────────────────

function ScoreSection({
  cycleId, canEdit, locked, stats, dimIssues, focusAspects = [], initialScores, unsavedFindingsRef,
}: {
  cycleId: string;
  canEdit: boolean;
  locked: boolean;
  stats: Record<string, DimStat>;
  dimIssues: Record<string, DimIssue[]>;
  focusAspects?: DeficiencyAspect[];
  initialScores: Record<string, number>;
  unsavedFindingsRef: MutableRefObject<() => boolean>;
}) {
  const focusSet = new Set(focusAspects);
  const toast = useToast();
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, number | null>>(initialScores);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [lockBusy, setLockBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  // debounce 儲存讀「最新」評分,避免 setTimeout 捕捉到 setScore 當下的 stale 快照(連續改多格時漏存)
  const scoresRef = useRef(scores);
  useEffect(() => { scoresRef.current = scores; }, [scores]);

  function setScore(dim: Dimension, raw: string) {
    const max = DIMENSION_MAX_SCORE[dim];
    let v: number | null = raw === '' ? null : Math.floor(Number(raw));
    if (v !== null) {
      if (Number.isNaN(v)) return;
      v = Math.max(0, Math.min(max, v));
    }
    setScores((prev) => ({ ...prev, [dim]: v }));
    setSaveState('dirty');
    if (timer.current) clearTimeout(timer.current);
    // 讀 scoresRef(下次 render 後即為含本次變更的最新值),不捕捉 stale 的 scores 快照
    timer.current = setTimeout(() => void save(scoresRef.current), 900);
  }

  async function save(payload: Record<string, number | null>): Promise<boolean> {
    setSaveState('saving');
    const body = {
      scores: Object.entries(payload).map(([dimension, score]) => ({
        dimension,
        score: score ?? null,
      })),
    };
    // 全部清空時送一筆 placeholder 仍會被後端 min(1) 擋;此處至少送出當前狀態
    const res = await fetch(`/api/cycles/${cycleId}/audit/scores`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('評分儲存失敗', j.error);
      setSaveState('dirty');
      return false;
    }
    setSaveState('saved');
    return true;
  }

  async function manualSave() {
    if (timer.current) clearTimeout(timer.current);
    if (await save(scores)) toast.success('已暫存', '評分已儲存,可稍後再繼續。');
  }
  // 確認填寫完畢 → 先存當前評分,再鎖定(rebuild 後整頁唯讀)
  async function doConfirmDone() {
    if (timer.current) clearTimeout(timer.current);
    setLockBusy(true);
    if (!(await save(scores))) { setLockBusy(false); return; }
    const res = await fetch(`/api/cycles/${cycleId}/audit/lock`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locked: true }),
    });
    setLockBusy(false);
    setConfirmOpen(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error('鎖定失敗', j.error); return; }
    toast.success('已確認填寫完畢', '評分與發現已鎖定;如需修改請按「解除鎖定」。');
    router.refresh();
  }
  async function unlock() {
    setLockBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/audit/lock`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locked: false }),
    });
    setLockBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error('解除鎖定失敗', j.error); return; }
    toast.success('已解除鎖定', '已通知最高管理員有內容異動,您可再編輯。');
    router.refresh();
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const myTotal = Object.values(scores).reduce<number>((a, v) => a + (v ?? 0), 0);
  const filledCount = Object.values(scores).filter((v) => v !== null && v !== undefined).length;

  return (
    <section>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => !lockBusy && !o && setConfirmOpen(false)}
        title="確認填寫完畢?"
        description="將鎖定您的評分與稽核發現,鎖定後無法修改。如需修改須「解除鎖定」,屆時系統會通知最高管理員有內容異動。"
        confirmLabel="確認並鎖定"
        onConfirm={doConfirmDone}
        loading={lockBusy}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-title-lg text-on-surface">稽核評分</h2>
          <p className="text-body-sm text-on-surface-variant mt-0.5 leading-relaxed">
            九項合計滿分 100;檢核結果統計由機關檢核表自動帶入供參。<br />
            可只評您負責的構面(未評的不計入您的小計);同一構面多位委員評分時,報告以各構面平均彙整。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <SaveStatus state={saveState === 'saved' ? 'idle' : saveState} dirtyLabel="未儲存" />
          )}
          <Chip tone={filledCount > 0 ? 'primary' : 'neutral'} size="sm">
            已評 {filledCount} 項{filledCount > 0 ? `・小計 ${myTotal} 分` : ''}
          </Chip>
          {canEdit && (
            <>
              <Button size="sm" variant="tonal" onClick={manualSave} loading={saveState === 'saving'}>暫存</Button>
              <Button
                size="sm"
                leadingIcon={<Check size={14} />}
                loading={lockBusy}
                onClick={() => {
                  // 鎖定前擋下未儲存的稽核發現,避免按「確認填寫完畢」後唯讀導致編輯遺失
                  if (unsavedFindingsRef.current()) {
                    toast.error('尚有稽核發現未儲存', '請先逐條按「儲存」或取消編輯,再確認填寫完畢。');
                    return;
                  }
                  setConfirmOpen(true);
                }}
              >
                確認填寫完畢
              </Button>
            </>
          )}
          {locked && (
            <>
              <Chip tone="success" size="sm" dot>已確認填寫完畢</Chip>
              <Button size="sm" variant="tonal" onClick={unlock} loading={lockBusy}>解除鎖定</Button>
            </>
          )}
        </div>
      </div>

      <details open className="mb-4 rounded-lg border border-outline-variant/60 bg-surface-container-lowest overflow-hidden">
        <summary className="cursor-pointer select-none px-5 py-3 text-body-sm font-medium text-on-surface hover:bg-surface-container-low">
          五等第評分標準說明(依檢核結果「符合 / 部分符合 / 不符合」數量評定等第與分數;不適用項目不計)
        </summary>
        <div className="px-5 pb-4 overflow-x-auto">
          <table className="w-full text-caption border-collapse min-w-[30rem]">
            <thead>
              <tr className="text-on-surface-variant">
                <th className="text-left font-medium py-1.5 pr-3 border-b border-outline-variant/60">檢核結果數量</th>
                <th className="text-center font-medium py-1.5 px-2 border-b border-outline-variant/60">等第</th>
                <th className="text-center font-medium py-1.5 px-2 border-b border-outline-variant/60">配分 10 分</th>
                <th className="text-center font-medium py-1.5 px-2 border-b border-outline-variant/60">配分 20 分</th>
              </tr>
            </thead>
            <tbody>
              {GRADE_STANDARD.map((r) => (
                <tr key={r.grade} className="border-b border-outline-variant/40 last:border-b-0">
                  <td className="py-1.5 pr-3 text-on-surface">{r.cond}</td>
                  <td className="text-center py-1.5 px-2"><Chip size="sm" tone={r.tone}>{r.grade}</Chip></td>
                  <td className="text-center py-1.5 px-2 tabular-nums text-on-surface-variant">{r.s10}</td>
                  <td className="text-center py-1.5 px-2 tabular-nums text-on-surface-variant">{r.s20}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2.5 text-caption text-on-surface-variant leading-relaxed">
            「執行良好」包括:① 優於規定(如驗證範圍涵蓋全機關);② 對檢核項目要求執行完整確實(如資安績效指標完整且高標準);③ 記錄完整(相關執行紀錄如期如實表現)。
          </p>
        </div>
      </details>

      <div className="rounded-md border border-outline-variant/60 overflow-hidden">
        {ASPECTS.map((aspect) => {
          const focused = focusSet.has(aspect);
          return (
          <div key={aspect}>
            <div className={`px-5 py-2 text-label border-b border-outline-variant/40 flex items-center gap-2 ${focused ? 'bg-primary-50 text-primary-800' : 'bg-surface-container-low text-on-surface-variant'}`}>
              {DEFICIENCY_ASPECT_LABELS[aspect]}
              {focused && <Chip size="sm" tone="primary">您負責</Chip>}
            </div>
            {ASPECT_DIMENSIONS[aspect].map((dim) => {
              const st = stats[dim] ?? { total: 0, c1: 0, c2: 0, c3: 0, c4: 0 };
              const v = scores[dim] ?? null;
              const answered = st.c1 + st.c2 + st.c3 + st.c4;
              const issues = dimIssues[dim] ?? [];
              return (
                <div key={dim} className="border-b border-outline-variant/40 last:border-b-0 bg-surface-container-lowest">
                <div
                  className="flex flex-col lg:flex-row lg:items-center gap-3 px-5 py-3.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-body text-on-surface">
                      {/* DIMENSION_LABELS 已含「一、」前綴,勿再加 DIMENSION_NUM(原本重複成「一、一、」) */}
                      {DIMENSION_LABELS[dim]}
                      <span className="text-on-surface-variant">({DIMENSION_MAX_SCORE[dim]} 分)</span>
                    </div>
                    <div className="text-caption text-on-surface-variant mt-1 leading-relaxed">{gradeHint(dim)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0 text-caption tabular-nums" aria-label="檢核結果統計:符合、部分符合、不符合、不適用題數">
                    <Chip size="sm" tone="neutral">{st.total} 題</Chip>
                    <Chip size="sm" tone="success">符 {st.c1}</Chip>
                    <Chip size="sm" tone="warning">部 {st.c2}</Chip>
                    <Chip size="sm" tone="danger">不 {st.c3}</Chip>
                    <Chip size="sm" tone="neutral">適 {st.c4}</Chip>
                    {answered < st.total && (
                      <span className="text-on-surface-variant">(未答 {st.total - answered})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* 自繪 −/＋ 級進器:取代原生 number spinner(原生 spinner 點一下會卷動、無法連續按) */}
                    <div className="inline-flex items-center rounded-md border border-outline-variant bg-surface overflow-hidden">
                      <button
                        type="button"
                        aria-label={`${DIMENSION_LABELS[dim]} 減一分`}
                        disabled={!canEdit || (v ?? 0) <= 0}
                        onClick={() => setScore(dim, String((v ?? 0) - 1))}
                        className="w-11 h-11 flex items-center justify-center text-title text-on-surface-variant hover:bg-surface-container disabled:opacity-40 focus-ring"
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
                        aria-label={`${DIMENSION_LABELS[dim]} 評分(0-${DIMENSION_MAX_SCORE[dim]})`}
                        className="w-12 h-11 border-x border-outline-variant bg-surface px-1 text-body text-center tabular-nums focus-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:bg-surface-container-low disabled:text-on-surface-variant"
                      />
                      <button
                        type="button"
                        aria-label={`${DIMENSION_LABELS[dim]} 加一分`}
                        disabled={!canEdit || (v ?? 0) >= DIMENSION_MAX_SCORE[dim]}
                        onClick={() => setScore(dim, String((v ?? 0) + 1))}
                        className="w-11 h-11 flex items-center justify-center text-title text-on-surface-variant hover:bg-surface-container disabled:opacity-40 focus-ring"
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
                {issues.length > 0 && (
                  <details className="px-5 pb-3">
                    <summary className="cursor-pointer text-caption text-danger-700 hover:underline select-none">
                      查看扣分依據({issues.length} 項部分符合/不符合)
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {issues.map((it) => (
                        <li key={it.itemNo} className="flex gap-2 text-caption text-on-surface-variant">
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
        <div className="flex items-center justify-end gap-3 px-5 py-3 bg-surface-container-low">
          <span className="text-body-sm text-on-surface-variant">您的評分小計(已評 {filledCount} 項;週期彙整得分見報告頁,以各構面平均計算)</span>
          <span className="text-title-lg text-on-surface tabular-nums">{filledCount === 0 ? '—' : myTotal}</span>
        </div>
      </div>
    </section>
  );
}

// ───────────────── 稽核發現 ───────────────────

type DraftFinding = { aspect: DeficiencyAspect; content: string; checklistRef: string };

function FindingSection({
  cycleId, canEdit, itemContent, dimIssues, initialFindings, unsavedFindingsRef,
}: {
  cycleId: string;
  canEdit: boolean;
  itemContent: Record<string, string>;
  dimIssues: Record<string, DimIssue[]>;
  initialFindings: MyFinding[];
  unsavedFindingsRef: MutableRefObject<() => boolean>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [findings, setFindings] = useState<MyFinding[]>(initialFindings);
  const [drafts, setDrafts] = useState<Partial<Record<FindingKind, DraftFinding>>>({});
  const [busy, setBusy] = useState<string | null>(null); // finding id 或 `new:KIND`
  const [deleting, setDeleting] = useState<MyFinding | null>(null);

  // 離開保護:編輯中未存的發現(editedRef)或有內容的草稿(draftDirtyRef)→ 關分頁攔截
  const editedRef = useRef<Set<string>>(new Set());
  const draftDirtyRef = useRef(false);
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

  function openDraft(kind: FindingKind) {
    setDrafts((d) => ({ ...d, [kind]: d[kind] ?? { aspect: 'STRATEGY', content: '', checklistRef: '' } }));
  }

  async function createFinding(kind: FindingKind) {
    const draft = drafts[kind];
    if (!draft || draft.content.trim().length < 5) {
      toast.error('內容太短', '稽核發現至少 5 字。');
      return;
    }
    setBusy(`new:${kind}`);
    const res = await fetch(`/api/cycles/${cycleId}/audit/findings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        aspect: draft.aspect,
        kind,
        content: draft.content.trim(),
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
  }

  // 從不符合/部分符合題一鍵帶成發現草稿(待改善),委員再補述後儲存
  async function importFinding(itemNo: string, content: string, dim: string) {
    setBusy(`import:${itemNo}`);
    const res = await fetch(`/api/cycles/${cycleId}/audit/findings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        aspect: DIM_TO_ASPECT[dim] ?? 'TECHNICAL',
        kind: 'IMPROVE',
        content: `依檢核項 ${itemNo}「${content}」,現況:(請委員補述具體缺失或不符之處及改善建議)`,
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
    toast.success('已帶入發現草稿', '請補述缺失內容後儲存。');
  }

  async function patchFinding(f: MyFinding) {
    setBusy(f.id);
    const res = await fetch(`/api/audit-findings/${f.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aspect: f.aspect, content: f.content, checklistRef: f.checklistRef }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return;
    }
    editedRef.current.delete(f.id);
    toast.success('已儲存發現');
  }

  async function deleteFinding(f: MyFinding) {
    setBusy(f.id);
    const res = await fetch(`/api/audit-findings/${f.id}`, { method: 'DELETE' });
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

  return (
    <section>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="刪除這條稽核發現?"
        description={deleting ? `「${deleting.content.slice(0, 60)}${deleting.content.length > 60 ? '…' : ''}」將被刪除,無法復原。` : undefined}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={() => { if (deleting) void deleteFinding(deleting); }}
        loading={busy === deleting?.id}
      />

      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <h2 className="text-title-lg text-on-surface">稽核發現</h2>
        {findings.length > 1 && (
          <Button size="sm" variant="text" onClick={sortByRef}>依項次排序</Button>
        )}
      </div>
      <p className="text-body-sm text-on-surface-variant mb-4">
        逐條輸入您的發現;全體委員的發現會自動彙整至報告。待改善事項與建議事項日後由管理員一鍵轉入缺失管考(法遵符合情形不轉)。
      </p>

      {/* pm-06:從檢核表不符合/部分符合題一鍵帶入發現草稿,免重打 */}
      {canEdit && (() => {
        const issues = Object.entries(dimIssues).flatMap(([dim, items]) => items.map((it) => ({ ...it, dim })));
        if (issues.length === 0) return null;
        return (
          <details className="mb-4 rounded-md border border-outline-variant/60 bg-surface-container-lowest overflow-hidden">
            <summary className="cursor-pointer select-none px-4 py-3 text-body-sm font-medium text-on-surface hover:bg-surface-container-low">
              從檢核表「部分符合/不符合」題帶入發現({issues.length})
            </summary>
            <ul className="divide-y divide-outline-variant/40">
              {issues.map((it) => (
                <li key={it.itemNo} className="flex items-start gap-3 px-4 py-3">
                  <Chip size="sm" tone={it.level === 'NON_COMPLIANT' ? 'danger' : 'warning'} className="shrink-0 font-mono">{it.itemNo}</Chip>
                  <span className="flex-1 min-w-0 text-body-sm text-on-surface-variant leading-relaxed">{it.content}</span>
                  <Button
                    size="sm"
                    variant="tonal"
                    loading={busy === `import:${it.itemNo}`}
                    onClick={() => importFinding(it.itemNo, it.content, it.dim)}
                    className="shrink-0"
                  >
                    帶入
                  </Button>
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
            <div key={kind} className="rounded-md border border-outline-variant/60 bg-surface-container-lowest">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-outline-variant/40">
                <div>
                  <span className="text-title text-on-surface">{FINDING_KIND_LABELS[kind]}</span>
                  <span className="ml-2 text-caption text-on-surface-variant/90">{FINDING_KIND_HINTS[kind]}</span>
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

              <div className="flex flex-col divide-y divide-outline-variant/40">
                {mine.length === 0 && !draft && (
                  <div className="px-5 py-4 text-body-sm text-on-surface-variant">尚無內容</div>
                )}
                {mine.map((f) => (
                  <div key={f.id} className="px-5 py-4 flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <AspectSelect
                        value={f.aspect}
                        disabled={!canEdit || f.locked}
                        onChange={(aspect) => mutate(f.id, { aspect })}
                      />
                      <div className="w-36">
                        <TextField
                          label="對應項次(選填)"
                          list="audit-item-refs"
                          value={f.checklistRef ?? ''}
                          onChange={(e) => mutate(f.id, { checklistRef: e.target.value })}
                          disabled={!canEdit || f.locked}
                        />
                      </div>
                      {canEdit && !f.locked && (f.checklistRef ?? '').trim() !== '' && (
                        <Button size="sm" variant="text" onClick={() => mutate(f.id, { checklistRef: '' })}>
                          清除項次
                        </Button>
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
                    {/* A5:即時顯示所引項次的題目摘要,避免引錯項次 */}
                    {f.checklistRef?.trim() && (
                      itemContent[f.checklistRef.trim()] ? (
                        <p className="text-caption text-on-surface-variant leading-relaxed bg-surface-container rounded-sm px-3 py-1.5">
                          對應檢核項【{f.checklistRef.trim()}】{itemContent[f.checklistRef.trim()]}
                        </p>
                      ) : (
                        <p className="text-caption text-warning-700">查無檢核項次「{f.checklistRef.trim()}」,請確認編號</p>
                      )
                    )}
                    <Textarea
                      label="發現內容"
                      value={f.content}
                      onChange={(e) => mutate(f.id, { content: e.target.value })}
                      disabled={!canEdit || f.locked}
                      rows={3}
                    />
                  </div>
                ))}

                {canEdit && draft && (
                  <div className="px-5 py-4 flex flex-col gap-2.5 bg-primary-50/30">
                    <div className="flex flex-wrap items-center gap-2">
                      <AspectSelect
                        value={draft.aspect}
                        onChange={(aspect) => setDrafts((d) => ({ ...d, [kind]: { ...draft, aspect } }))}
                      />
                      <div className="w-36">
                        <TextField
                          label="對應項次(選填)"
                          list="audit-item-refs"
                          value={draft.checklistRef}
                          onChange={(e) => setDrafts((d) => ({ ...d, [kind]: { ...draft, checklistRef: e.target.value } }))}
                        />
                      </div>
                      {draft.checklistRef.trim() !== '' && (
                        <Button size="sm" variant="text" onClick={() => setDrafts((d) => ({ ...d, [kind]: { ...draft, checklistRef: '' } }))}>
                          清除項次
                        </Button>
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
                    <Textarea
                      label="發現內容(可直接從 Word 貼上)"
                      value={draft.content}
                      onChange={(e) => setDrafts((d) => ({ ...d, [kind]: { ...draft, content: e.target.value } }))}
                      rows={3}
                      placeholder="例:依資通安全管理法第 9 條規定…,惟查…"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
      className="h-10 rounded-md border border-outline-variant bg-surface px-3 text-body-sm focus-ring disabled:bg-surface-container-low disabled:text-on-surface-variant"
    >
      {ASPECTS.map((a) => (
        <option key={a} value={a}>{DEFICIENCY_ASPECT_LABELS[a]}</option>
      ))}
    </select>
  );
}
