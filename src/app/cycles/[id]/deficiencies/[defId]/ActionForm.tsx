'use client';

import { useEffect, useState } from 'react';
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
import { Check, AlertTriangle, Paperclip, Upload } from '@/components/icons';
import { EXEC_STATUSES, EXEC_STATUS_LABELS, ACTION_STATUS_LABELS, type ActionStatus, type ExecStatus } from '@/lib/types';
import { TOAST } from '@/lib/copy';

type Review = {
  id: string;
  round: number;
  decision: string;
  comment: string | null;
  decidedAt: string;
  auditorName: string;
};

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
}: {
  deficiencyId: string;
  action: ActionData | null;
  editable: boolean;
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

  // 佐證
  const [evidences, setEvidences] = useState<{ id: string; originalName: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!action) return;
    fetch(`/api/evidences?targetType=CORRECTIVE_ACTION&targetId=${action.id}`)
      .then((r) => r.json())
      .then((j) => setEvidences(j.items ?? []))
      .catch(() => {});
  }, [action?.id]);

  const exec = execStatus as ExecStatus | '';
  const needActual = exec === 'ON_TIME_DONE' || exec === 'LATE_DONE';
  const needExtended = exec === 'LATE_IN_PROGRESS';
  const needReason = exec === 'LATE_DONE' || exec === 'LATE_IN_PROGRESS';

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
    const t = TOAST.submittedAction();
    toast.success(t.title, t.description);
    router.refresh();
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !action) return;
    if (f.size > 20 * 1024 * 1024) {
      toast.error('上傳失敗', '檔案超過 20MB 上限');
      e.target.value = '';
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append('file', f);
    fd.append('targetType', 'CORRECTIVE_ACTION');
    fd.append('targetId', action.id);
    const res = await fetch('/api/evidences', { method: 'POST', body: fd });
    setUploading(false);
    if (res.ok) {
      const j = await res.json();
      setEvidences((prev) => [...prev, j.item]);
      toast.success('已上傳佐證', f.name);
    } else {
      const j = await res.json().catch(() => ({ error: '上傳失敗' }));
      toast.error('上傳失敗', j.error);
    }
    e.target.value = '';
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
    body: r.comment ? <p className="whitespace-pre-wrap">{r.comment}</p> : null,
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
            onChange={(e) => setRootCause(e.target.value)}
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
                        onChange={(e) =>
                          setMeasures((prev) => ({
                            ...prev,
                            [m.key]: { ...prev[m.key], on: e.target.checked },
                          }))
                        }
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
                          onChange={(e) =>
                            setMeasures((prev) => ({
                              ...prev,
                              [m.key]: { ...prev[m.key], text: e.target.value },
                            }))
                          }
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
              onChange={(e) => setPlannedDate(e.target.value)}
              disabled={readonly}
            />
            <Textarea
              label="進度追蹤方式"
              value={trackingMethod}
              onChange={(e) => setTrackingMethod(e.target.value)}
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
                    onChange={() => setExecStatus(s)}
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
                    onChange={(e) => setActualDate(e.target.value)}
                    disabled={readonly}
                  />
                )}
                {needExtended && (
                  <TextField
                    label="預計完成日期延長至"
                    type="date"
                    value={extendedDate}
                    onChange={(e) => setExtendedDate(e.target.value)}
                    disabled={readonly}
                  />
                )}
                {needReason && (
                  <div className="sm:col-span-2">
                    <Textarea
                      label="逾期原因"
                      value={delayReason}
                      onChange={(e) => setDelayReason(e.target.value)}
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
              {evidences.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant mb-2">尚未上傳</p>
              ) : (
                <ul className="mb-2 space-y-1">
                  {evidences.map((f) => (
                    <li key={f.id}>
                      <a
                        className="inline-flex items-center gap-1.5 text-body-sm text-primary-700 hover:underline"
                        href={`/api/evidences/${f.id}/download`}
                      >
                        <Paperclip size={14} />
                        {f.originalName}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {editable && (
                <label className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-surface border border-dashed border-primary-400 text-primary-700 hover:bg-primary-50 cursor-pointer focus-ring transition-colors">
                  <input type="file" className="hidden" onChange={upload} disabled={uploading} />
                  <Upload size={14} />
                  <span className="text-body-sm">{uploading ? '上傳中…' : '+ 上傳佐證'}</span>
                </label>
              )}
            </div>
          )}

          {/* 動作 */}
          {editable && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="tonal" loading={saving} onClick={saveDraft}>
                儲存草稿
              </Button>
              <Button loading={saving} onClick={() => setSubmitOpen(true)}>
                送出審核
              </Button>
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
