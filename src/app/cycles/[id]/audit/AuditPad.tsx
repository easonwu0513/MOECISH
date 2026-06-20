'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Textarea } from '@/components/ui/Textarea';
import { TextField } from '@/components/ui/TextField';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Plus, Check } from '@/components/icons';
import { DIMENSION_LABELS } from '@/lib/dimension';
import { DEFICIENCY_ASPECT_LABELS, type DeficiencyAspect, type Dimension } from '@/lib/types';
import {
  ASPECT_DIMENSIONS, DIMENSION_MAX_SCORE, DIMENSION_NUM,
  gradeOf, gradeHint, GRADE_TONE,
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

// ─────────────────────────────────────────────

export default function AuditPad({
  cycleId,
  canEdit,
  stats,
  itemRefs,
  itemContent = {},
  dimIssues = {},
  initialScores,
  initialFindings,
}: {
  cycleId: string;
  canEdit: boolean;
  stats: Record<string, DimStat>;
  itemRefs: string[];
  itemContent?: Record<string, string>;
  dimIssues?: Record<string, DimIssue[]>;
  initialScores: Record<string, number>;
  initialFindings: MyFinding[];
}) {
  return (
    <div className="flex flex-col gap-8">
      {/* 對應檢核項次建議清單(委員輸入時下拉選 7.4 等有效項次) */}
      <datalist id="audit-item-refs">
        {itemRefs.map((r) => <option key={r} value={r} />)}
      </datalist>
      <ScoreSection cycleId={cycleId} canEdit={canEdit} stats={stats} dimIssues={dimIssues} initialScores={initialScores} />
      <FindingSection cycleId={cycleId} canEdit={canEdit} itemContent={itemContent} dimIssues={dimIssues} initialFindings={initialFindings} />
    </div>
  );
}

// ───────────────── 評分表 ─────────────────────

function ScoreSection({
  cycleId, canEdit, stats, dimIssues, initialScores,
}: {
  cycleId: string;
  canEdit: boolean;
  stats: Record<string, DimStat>;
  dimIssues: Record<string, DimIssue[]>;
  initialScores: Record<string, number>;
}) {
  const toast = useToast();
  const [scores, setScores] = useState<Record<string, number | null>>(initialScores);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();

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
    timer.current = setTimeout(() => void save({ ...scores, [dim]: v }), 900);
  }

  async function save(payload: Record<string, number | null>) {
    setSaveState('saving');
    const body = {
      scores: Object.entries(payload).map(([dimension, score]) => ({
        dimension,
        score: score ?? null,
      })),
    };
    const res = await fetch(`/api/cycles/${cycleId}/audit/scores`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('評分儲存失敗', j.error);
      setSaveState('dirty');
      return;
    }
    setSaveState('saved');
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const myTotal = Object.values(scores).reduce<number>((a, v) => a + (v ?? 0), 0);
  const filledCount = Object.values(scores).filter((v) => v !== null && v !== undefined).length;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-title-lg text-on-surface">稽核評分</h2>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            九項合計滿分 100;檢核結果統計由機關檢核表自動帶入供參。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canEdit && saveState === 'dirty' && (
            <span className="inline-flex items-center gap-1.5 text-caption text-warning-600">
              <span className="w-2 h-2 rounded-full bg-warning-400 animate-pulse" aria-hidden /> 未儲存
            </span>
          )}
          {canEdit && saveState === 'saving' && (
            <span className="text-caption text-on-surface-variant">儲存中…</span>
          )}
          {/* 成功一律安靜(進度 Chip 即持久訊號),只在未存/儲存中提示 */}
          <Chip tone={filledCount === 9 ? 'success' : 'neutral'} size="sm">
            {filledCount === 9 ? `總分 ${myTotal}` : `已評 ${filledCount} / 9 項`}
          </Chip>
        </div>
      </div>

      <div className="rounded-md border border-outline-variant/60 overflow-hidden">
        {ASPECTS.map((aspect) => (
          <div key={aspect}>
            <div className="bg-surface-container-low px-5 py-2 text-label text-on-surface-variant border-b border-outline-variant/40">
              {DEFICIENCY_ASPECT_LABELS[aspect]}
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
                      {DIMENSION_NUM[dim]}、{DIMENSION_LABELS[dim]}
                      <span className="text-on-surface-variant">({DIMENSION_MAX_SCORE[dim]} 分)</span>
                    </div>
                    <div className="text-caption text-on-surface-variant mt-1 leading-relaxed">{gradeHint(dim)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0 text-caption tabular-nums" aria-label="檢核結果統計">
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
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={DIMENSION_MAX_SCORE[dim]}
                      value={v ?? ''}
                      onChange={(e) => setScore(dim, e.target.value)}
                      disabled={!canEdit}
                      aria-label={`${DIMENSION_LABELS[dim]} 評分(0-${DIMENSION_MAX_SCORE[dim]})`}
                      className="w-20 h-10 rounded-md border border-outline-variant bg-surface px-3 text-body text-right tabular-nums focus-ring disabled:bg-surface-container-low disabled:text-on-surface-variant"
                    />
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
                      查看扣分依據({issues.length} 項未達符合)
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
        ))}
        <div className="flex items-center justify-end gap-3 px-5 py-3 bg-surface-container-low">
          <span className="text-body-sm text-on-surface-variant">得分(滿分 100)</span>
          {filledCount === 9 ? (
            <span className="text-title-lg text-on-surface tabular-nums">{myTotal}</span>
          ) : (
            <span className="text-body-sm text-warning-700 tabular-nums">
              {filledCount === 0 ? '尚未評分' : `暫計 ${myTotal} · 尚有 ${9 - filledCount} 項未評`}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// ───────────────── 稽核發現 ───────────────────

type DraftFinding = { aspect: DeficiencyAspect; content: string; checklistRef: string };

function FindingSection({
  cycleId, canEdit, itemContent, dimIssues, initialFindings,
}: {
  cycleId: string;
  canEdit: boolean;
  itemContent: Record<string, string>;
  dimIssues: Record<string, DimIssue[]>;
  initialFindings: MyFinding[];
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
        content: `依檢核項 ${itemNo}「${content}」,機關尚未符合;建議:(請委員補述缺失情形與改善建議)`,
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

      <h2 className="text-title-lg text-on-surface mb-1">稽核發現</h2>
      <p className="text-body-sm text-on-surface-variant mb-4">
        逐條輸入您的發現;全體委員的發現會自動彙整至報告。待改善/建議事項日後由管理員一鍵轉入缺失管考。
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
