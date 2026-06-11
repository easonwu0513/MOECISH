'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Textarea } from '@/components/ui/Textarea';
import { TextField } from '@/components/ui/TextField';
import { Timeline, type TimelineNode } from '@/components/ui/Timeline';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Check, AlertTriangle, Paperclip, X } from '@/components/icons';
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { EXEC_STATUSES, EXEC_STATUS_LABELS, ACTION_STATUS_LABELS, type ActionStatus, type ExecStatus } from '@/lib/types';
import { TOAST } from '@/lib/copy';

type Review = {
  id: string;
  round: number;
  decision: string;
  comment: string | null;
  snapshot: string | null;
  decidedAt: string;
  auditorName: string;
};

/** 渲染某輪審查當下的填報快照(多輪比對用) */
function SnapshotDetails({ snapshot }: { snapshot: string }) {
  let s: Record<string, string | null>;
  try {
    s = JSON.parse(snapshot);
  } catch {
    return null;
  }
  const rows: { label: string; value: string | null }[] = [
    { label: '發生原因', value: s.rootCause },
    { label: '策略面', value: s.measureStrategy },
    { label: '管理面', value: s.measureManagement },
    { label: '技術面', value: s.measureTechnical },
    { label: '預計完成', value: s.plannedDate ? String(s.plannedDate).slice(0, 10) : null },
    { label: '追蹤方式', value: s.trackingMethod },
    { label: '執行情形', value: s.execStatus ? EXEC_STATUS_LABELS[s.execStatus as ExecStatus] ?? s.execStatus : null },
    { label: '逾期原因', value: s.delayReason },
  ].filter((r) => r.value);
  if (rows.length === 0) return null;
  return (
    <details className="mt-1.5">
      <summary className="text-caption text-primary-700 cursor-pointer hover:underline select-none">
        檢視該輪填報內容
      </summary>
      <dl className="mt-1.5 rounded-sm bg-surface-container p-2.5 space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="text-caption leading-relaxed">
            <dt className="inline font-medium text-on-surface">{r.label}:</dt>{' '}
            <dd className="inline text-on-surface-variant whitespace-pre-wrap">{r.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

type ActionData = {
  id: string;
  status: ActionStatus;
  round: number;
  rootCause: string | null;
  measureStrategy: string | null;
  measureManagement: string | null;
  measureTechnical: string | null;
  plannedDate: string | null;
  trackingMethod: string | null;
  execStatus: string | null;
  actualDate: string | null;
  extendedDate: string | null;
  delayReason: string | null;
  reviews: Review[];
};

const MEASURE_DEFS = [
  { key: 'measureStrategy' as const, label: '策略面調整', hint: '如資安政策、資源、資安組織調整…等措施' },
  { key: 'measureManagement' as const, label: '管理面調整', hint: '如資安維護計畫、程序書、作業說明書內容調整…等措施' },
  { key: 'measureTechnical' as const, label: '技術面調整', hint: '如表單、執行紀錄與檢核表內容調整、其他技術面應執行事項…等措施' },
];

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export default function ActionForm({
  deficiencyId,
  action,
  editable,
  nextHref,
  remaining,
}: {
  deficiencyId: string;
  action: ActionData | null;
  editable: boolean;
  nextHref?: string | null;
  remaining?: number;
}) {
  const router = useRouter();
  const toast = useToast();

  const [rootCause, setRootCause] = useState(action?.rootCause ?? '');
  const [measures, setMeasures] = useState<Record<string, { on: boolean; text: string }>>(() => ({
    measureStrategy: { on: !!action?.measureStrategy, text: action?.measureStrategy ?? '' },
    measureManagement: { on: !!action?.measureManagement, text: action?.measureManagement ?? '' },
    measureTechnical: { on: !!action?.measureTechnical, text: action?.measureTechnical ?? '' },
  }));
  const [plannedDate, setPlannedDate] = useState(toDateInput(action?.plannedDate ?? null));
  const [trackingMethod, setTrackingMethod] = useState(action?.trackingMethod ?? '');
  const [execStatus, setExecStatus] = useState<string>(action?.execStatus ?? '');
  const [actualDate, setActualDate] = useState(toDateInput(action?.actualDate ?? null));
  const [extendedDate, setExtendedDate] = useState(toDateInput(action?.extendedDate ?? null));
  const [delayReason, setDelayReason] = useState(action?.delayReason ?? '');
  const [saving, setSaving] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  // ── 防弄丟:dirty 追蹤 + 30 秒自動儲存 + 關閉分頁警告 ──
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const touch = () => { dirtyRef.current = true; setDirty(true); };
  const clearDirty = () => {
    dirtyRef.current = false;
    setDirty(false);
    const now = new Date();
    setAutoSavedAt(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  };

  // 佐證(載入中顯示骨架,避免先閃「尚未上傳」誤導委員)
  const [evidences, setEvidences] = useState<{ id: string; originalName: string }[]>([]);
  const [evLoading, setEvLoading] = useState(!!action);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!action) return;
    setEvLoading(true);
    fetch(`/api/evidences?targetType=CORRECTIVE_ACTION&targetId=${action.id}`)
      .then((r) => r.json())
      .then((j) => setEvidences(j.items ?? []))
      .catch(() => {})
      .finally(() => setEvLoading(false));
  }, [action?.id]);

  const exec = execStatus as ExecStatus | '';
  const needActual = exec === 'ON_TIME_DONE' || exec === 'LATE_DONE';
  const needExtended = exec === 'LATE_IN_PROGRESS';
  const needReason = exec === 'LATE_DONE' || exec === 'LATE_IN_PROGRESS';

  // 最新 payload 供自動儲存讀取(避免閉包過期)
  const payloadRef = useRef<() => Record<string, unknown>>(() => ({}));
  payloadRef.current = buildPayload;

  // 30 秒自動儲存草稿(成功靜默,只更新時間戳;失敗保留 dirty 待下次)
  useEffect(() => {
    if (!editable || !dirty) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/deficiencies/${deficiencyId}/action`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payloadRef.current()),
        });
        if (res.ok) clearDirty();
      } catch {
        /* 離線等情況:保留 dirty,使用者手動儲存或下次自動再試 */
      }
    }, 30_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, editable, deficiencyId]);

  // 關閉/重整分頁時,有未儲存變更則攔截
  useEffect(() => {
    if (!editable) return;
    const h = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [editable]);

  function buildPayload() {
    return {
      rootCause,
      measureStrategy: measures.measureStrategy.on ? measures.measureStrategy.text : null,
      measureManagement: measures.measureManagement.on ? measures.measureManagement.text : null,
      measureTechnical: measures.measureTechnical.on ? measures.measureTechnical.text : null,
      plannedDate: plannedDate || null,
      trackingMethod,
      execStatus: execStatus || null,
      actualDate: needActual ? actualDate || null : null,
      extendedDate: needExtended ? extendedDate || null : null,
      delayReason: needReason ? delayReason || null : null,
    };
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    const res = await fetch(`/api/deficiencies/${deficiencyId}/action`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return false;
    }
    return true;
  }

  async function saveDraft() {
    if (await save()) {
      clearDirty();
      const t = TOAST.savedAction();
      toast.success(t.title, t.description);
      router.refresh();
    }
  }

  async function submit() {
    if (!(await save())) { setSubmitOpen(false); return; }
    setSaving(true);
    const res = await fetch(`/api/deficiencies/${deficiencyId}/action/submit`, { method: 'POST' });
    setSaving(false);
    setSubmitOpen(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '送出失敗' }));
      toast.error('送出失敗', j.error);
      return;
    }
    clearDirty();
    const t = TOAST.submittedAction();
    if (nextHref && remaining && remaining > 0) {
      toast.success(t.title, `還有 ${remaining} 筆待處理,已為你開啟下一筆。`);
      router.push(nextHref);
      router.refresh();
    } else {
      toast.success(t.title, t.description);
      router.refresh();
    }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !action) return;
    const tooBig = files.filter((f) => f.size > 20 * 1024 * 1024);
    if (tooBig.length > 0) {
      toast.error('檔案超過 20MB 上限', tooBig.map((f) => f.name).join('、'));
      e.target.value = '';
      return;
    }
    setUploading(true);
    let ok = 0;
    for (const f of files) {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('targetType', 'CORRECTIVE_ACTION');
      fd.append('targetId', action.id);
      const res = await fetch('/api/evidences', { method: 'POST', body: fd });
      if (res.ok) {
        const j = await res.json();
        setEvidences((prev) => [...prev, j.item]);
        ok += 1;
      } else {
        const j = await res.json().catch(() => ({ error: '上傳失敗' }));
        toast.error(`「${f.name}」上傳失敗`, j.error);
      }
    }
    setUploading(false);
    if (ok > 0) toast.success('已上傳佐證', files.length > 1 ? `共 ${ok}/${files.length} 個檔案` : files[0].name);
    e.target.value = '';
  }

  async function removeEvidence(id: string, name: string) {
    if (!window.confirm(`確定刪除佐證「${name}」?刪除後無法復原。`)) return;
    const res = await fetch(`/api/evidences/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setEvidences((prev) => prev.filter((f) => f.id !== id));
      toast.success('已刪除佐證', name);
    } else {
      const j = await res.json().catch(() => ({ error: '刪除失敗' }));
      toast.error('刪除失敗', j.error);
    }
  }

  // ── 審查歷程 timeline ──
  const status = action?.status ?? 'PENDING';
  const timelineNodes: TimelineNode[] = (action?.reviews ?? []).map((r) => ({
    id: r.id,
    tone: r.decision === 'PASS' ? 'success' : 'warning',
    icon: r.decision === 'PASS' ? <Check size={10} /> : <AlertTriangle size={10} />,
    title: (
      <>
        <span>第 {r.round} 輪 · {r.auditorName}</span>
        <Chip tone={r.decision === 'PASS' ? 'success' : 'warning'} size="sm">
          {r.decision === 'PASS' ? '審核通過' : '退回補正'}
        </Chip>
      </>
    ),
    meta: new Date(r.decidedAt).toLocaleString('zh-TW'),
    body: (
      <>
        {r.comment && <p className="whitespace-pre-wrap">{r.comment}</p>}
        {r.snapshot && <SnapshotDetails snapshot={r.snapshot} />}
      </>
    ),
  }));
  if (status !== 'PASSED') {
    timelineNodes.push({
      id: 'current',
      tone: 'sage',
      pulse: status === 'DRAFT' || status === 'RETURNED' || status === 'SUBMITTED',
      title: (
        <>
          <span>第 {action?.round ?? 1} 輪（當前）</span>
          <Chip tone="sage" size="sm">{ACTION_STATUS_LABELS[status]}</Chip>
        </>
      ),
      meta: status === 'PENDING' ? '尚待機關開始填報' : undefined,
    });
  }

  const readonly = !editable;

  return (
    <Card className="mb-8">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* 左:審查歷程 */}
        <div>
          <p className="text-label text-on-surface-variant mb-3">審查歷程</p>
          <Timeline nodes={timelineNodes} />
        </div>

        {/* 右:範本六欄表單 */}
        <div className="flex flex-col gap-5">
          <CardTitle>矯正措施填報</CardTitle>

          <Textarea
            label="發生原因（根因分析）"
            value={rootCause}
            onChange={(e) => { touch(); setRootCause(e.target.value); }}
            disabled={readonly}
            rows={3}
            placeholder="例：DNS 伺服器作業系統預設系統日誌存放版本為 7 份…"
          />

          {/* 改善措施(可複選,三類) */}
          <div>
            <p className="text-label text-on-surface mb-2">改善措施（可複選）</p>
            <div className="flex flex-col gap-3">
              {MEASURE_DEFS.map((m) => {
                const st = measures[m.key];
                return (
                  <div
                    key={m.key}
                    className={cn(
                      'rounded-md border p-4 transition-colors',
                      st.on ? 'border-primary-400 bg-primary-50/40' : 'border-outline-variant',
                    )}
                  >
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={st.on}
                        disabled={readonly}
                        onChange={(e) => {
                          touch();
                          setMeasures((prev) => ({
                            ...prev,
                            [m.key]: { ...prev[m.key], on: e.target.checked },
                          }));
                        }}
                        className="mt-0.5 accent-primary-600"
                      />
                      <span className="min-w-0">
                        <span className="text-body-sm font-medium text-on-surface">{m.label}</span>
                        <span className="block text-caption text-on-surface-variant">{m.hint}</span>
                      </span>
                    </label>
                    {st.on && (
                      <div className="mt-3">
                        <Textarea
                          value={st.text}
                          onChange={(e) => {
                            touch();
                            setMeasures((prev) => ({
                              ...prev,
                              [m.key]: { ...prev[m.key], text: e.target.value },
                            }));
                          }}
                          disabled={readonly}
                          rows={2}
                          placeholder={`${m.label}之具體說明…`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              label="預計完成時程"
              type="date"
              value={plannedDate}
              onChange={(e) => { touch(); setPlannedDate(e.target.value); }}
              disabled={readonly}
            />
            <Textarea
              label="進度追蹤方式"
              value={trackingMethod}
              onChange={(e) => { touch(); setTrackingMethod(e.target.value); }}
              disabled={readonly}
              rows={2}
              placeholder="例：將於 115.07.31 確認日誌檔保存月份數量"
            />
          </div>

          {/* 執行情形(範本四選一) */}
          <div>
            <p className="text-label text-on-surface mb-2">執行情形</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EXEC_STATUSES.map((s) => (
                <label
                  key={s}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md border px-4 py-3 cursor-pointer transition-colors',
                    execStatus === s ? 'border-primary-400 bg-primary-50/40' : 'border-outline-variant hover:bg-surface-container',
                    readonly && 'cursor-not-allowed opacity-70',
                  )}
                >
                  <input
                    type="radio"
                    name="execStatus"
                    checked={execStatus === s}
                    disabled={readonly}
                    onChange={() => { touch(); setExecStatus(s); }}
                    className="accent-primary-600"
                  />
                  <span className="text-body-sm text-on-surface">{EXEC_STATUS_LABELS[s]}</span>
                </label>
              ))}
            </div>

            {(needActual || needExtended || needReason) && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-md bg-surface-container p-4">
                {needActual && (
                  <TextField
                    label="實際完成日期"
                    type="date"
                    value={actualDate}
                    onChange={(e) => { touch(); setActualDate(e.target.value); }}
                    disabled={readonly}
                  />
                )}
                {needExtended && (
                  <TextField
                    label="預計完成日期延長至"
                    type="date"
                    value={extendedDate}
                    onChange={(e) => { touch(); setExtendedDate(e.target.value); }}
                    disabled={readonly}
                  />
                )}
                {needReason && (
                  <div className="sm:col-span-2">
                    <Textarea
                      label="逾期原因"
                      value={delayReason}
                      onChange={(e) => { touch(); setDelayReason(e.target.value); }}
                      disabled={readonly}
                      rows={2}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 佐證 */}
          {action && (
            <div>
              <p className="text-label text-on-surface mb-2">佐證文件</p>
              {evLoading ? (
                <div className="mb-2 space-y-1.5" aria-label="佐證載入中">
                  <div className="h-4 w-48 rounded bg-surface-container-high animate-pulse" />
                  <div className="h-4 w-36 rounded bg-surface-container-high animate-pulse" />
                </div>
              ) : evidences.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant mb-2">尚未上傳</p>
              ) : (
                <ul className="mb-2 space-y-1">
                  {evidences.map((f) => (
                    <li key={f.id} className="flex items-center gap-2">
                      <a
                        className="inline-flex items-center gap-1.5 text-body-sm text-primary-700 hover:underline"
                        href={`/api/evidences/${f.id}/download?inline=1`}
                        target="_blank"
                        rel="noopener"
                        title="圖片與 PDF 會在新分頁開啟預覽,其他格式直接下載"
                      >
                        <Paperclip size={14} />
                        {f.originalName}
                      </a>
                      {editable && (
                        <button
                          type="button"
                          onClick={() => removeEvidence(f.id, f.originalName)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-on-surface-variant hover:text-danger-600 hover:bg-danger-50 transition-colors focus-ring"
                          aria-label={`刪除佐證 ${f.originalName}`}
                          title="刪除這個佐證檔"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {editable && (
                <>
                  <FileUploadButton
                    label="+ 上傳佐證(可多選)"
                    busy={uploading}
                    onChange={upload}
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.png,.jpg,.jpeg,.gif,.webp,.zip"
                  />
                  <p className="mt-1.5 text-caption text-on-surface-variant">
                    單檔 ≤ 20MB;支援 PDF、Word/Excel/PPT、圖片、ZIP
                  </p>
                </>
              )}
            </div>
          )}

          {/* 動作 */}
          {editable && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
              <Button variant="tonal" loading={saving} onClick={saveDraft}>
                儲存草稿
              </Button>
              <Button loading={saving} onClick={() => setSubmitOpen(true)}>
                送出審核
              </Button>
              {/* 儲存狀態:dirty=琥珀點、saved=綠勾 — 核心安全感訊號要看得見 */}
              {dirty ? (
                <span className="inline-flex items-center gap-1.5 text-caption text-warning-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning-500 shrink-0" aria-hidden />
                  未儲存(30 秒內自動儲存)
                </span>
              ) : autoSavedAt ? (
                <span className="inline-flex items-center gap-1.5 text-caption text-success-700">
                  <Check size={13} className="shrink-0" />
                  已自動儲存 {autoSavedAt}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={submitOpen}
        onOpenChange={(o) => !saving && setSubmitOpen(o)}
        title="送出審核"
        description="送出後將鎖定編輯，由稽核委員進行審查。確認矯正措施與佐證皆已填妥？"
        confirmLabel="送出"
        tone="primary"
        onConfirm={submit}
        loading={saving}
      />
    </Card>
  );
}
