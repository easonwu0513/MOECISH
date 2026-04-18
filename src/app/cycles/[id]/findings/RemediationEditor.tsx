'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Textarea } from '@/components/ui/Textarea';
import { TextField } from '@/components/ui/TextField';
import { Timeline, type TimelineNode } from '@/components/ui/Timeline';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Check, AlertTriangle, Paperclip, Upload } from '@/components/icons';
import { REM_STATUS_LABELS } from '@/lib/state-machine';
import { TOAST } from '@/lib/copy';
import type { RemediationStatus } from '@/lib/types';

const ACTION_TAGS = [
  '修訂作業程序',
  '教育訓練',
  '導入技術控制',
  '加強監控',
  '委外合約補正',
  '資源／預算調整',
  '其他',
];

type Decision = {
  id: string;
  round: number;
  decision: string;
  comment: string | null;
  decidedAt: Date | string;
};

type Remediation = {
  id: string;
  status: string;
  rootCause: string | null;
  actions: string | null;
  actionTagsJson: string | null;
  plannedDueDate: Date | string | null;
  trackingMethod: string | null;
  executionStatus: string | null;
  currentRound: number;
  version: number;
  decisions: Decision[];
};

export default function RemediationEditor({
  finding,
  remediation,
  userRole,
}: {
  finding: { id: string; findingNo: string };
  remediation: Remediation | null;
  userRole: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const status = (remediation?.status ?? 'PENDING') as RemediationStatus;
  const canEditResp = (userRole === 'RESPONDENT' || userRole === 'SUPERVISOR') &&
    (status === 'PENDING' || status === 'DRAFT' || status === 'NEEDS_REWORK');
  const canAudit = (userRole === 'AUDITOR' || userRole === 'ADMIN') && status === 'SUBMITTED';

  const [rootCause, setRootCause] = useState(remediation?.rootCause ?? '');
  const [actions, setActions] = useState(remediation?.actions ?? '');
  const [tags, setTags] = useState<string[]>(() => {
    try { return remediation?.actionTagsJson ? JSON.parse(remediation.actionTagsJson) : []; }
    catch { return []; }
  });
  const [plannedDueDate, setPlannedDueDate] = useState(
    remediation?.plannedDueDate ? new Date(remediation.plannedDueDate).toISOString().slice(0, 10) : '',
  );
  const [trackingMethod, setTrackingMethod] = useState(remediation?.trackingMethod ?? '');
  const [executionStatus, setExecutionStatus] = useState(remediation?.executionStatus ?? '');
  const [saving, setSaving] = useState(false);

  const [decideOpen, setDecideOpen] = useState<'APPROVED' | 'NEEDS_REWORK' | null>(null);
  const [decideComment, setDecideComment] = useState('');

  const [evidences, setEvidences] = useState<{ id: string; originalName: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!remediation) return;
    fetch(`/api/evidences?targetType=REMEDIATION&targetId=${remediation.id}`)
      .then((r) => r.json())
      .then((j) => setEvidences(j.items ?? []))
      .catch(() => {});
  }, [remediation?.id]);

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function save(submit: boolean) {
    setSaving(true);
    const res = await fetch(`/api/findings/${finding.id}/remediation`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rootCause,
        actions,
        actionTags: tags,
        plannedDueDate: plannedDueDate || null,
        trackingMethod,
        executionStatus,
        submit,
        version: remediation?.version ?? 0,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return;
    }
    const t = submit ? TOAST.submittedRemediation() : TOAST.savedRemediation();
    toast.success(t.title, t.description);
    router.refresh();
  }

  async function decide() {
    if (!decideOpen) return;
    const decision = decideOpen;
    if (decision === 'NEEDS_REWORK' && !decideComment.trim()) {
      toast.error('請填寫持續改正原因', '退回補正必須附說明');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/findings/${finding.id}/remediation/decisions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision, comment: decideComment }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '失敗' }));
      toast.error('審核失敗', j.error);
      return;
    }
    const t = decision === 'APPROVED' ? TOAST.approvedRemediation() : TOAST.needsReworkRemediation();
    toast.success(t.title, t.description);
    setDecideOpen(null);
    setDecideComment('');
    router.refresh();
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !remediation) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error('上傳失敗', '檔案超過 5MB 上限');
      e.target.value = '';
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append('file', f);
    fd.append('targetType', 'REMEDIATION');
    fd.append('targetId', remediation.id);
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

  // Build Timeline nodes
  const timelineNodes: TimelineNode[] = [];
  // Past rounds from decisions
  (remediation?.decisions ?? []).forEach((d) => {
    timelineNodes.push({
      id: d.id,
      tone: d.decision === 'APPROVED' ? 'success' : 'warning',
      icon: d.decision === 'APPROVED' ? <Check size={10} /> : <AlertTriangle size={10} />,
      title: (
        <>
          <span>第 {d.round} 輪</span>
          <Chip tone={d.decision === 'APPROVED' ? 'success' : 'warning'} size="sm">
            {d.decision === 'APPROVED' ? '審核通過' : '持續改正'}
          </Chip>
        </>
      ),
      meta: new Date(d.decidedAt).toLocaleString('zh-TW'),
      body: d.comment ? <p className="whitespace-pre-wrap">{d.comment}</p> : null,
    });
  });
  // Current round node
  if (status !== 'APPROVED' || (remediation?.decisions ?? []).length === 0) {
    timelineNodes.push({
      id: 'current',
      tone: status === 'APPROVED' ? 'success' : 'sage',
      pulse: status === 'DRAFT' || status === 'NEEDS_REWORK' || status === 'SUBMITTED',
      title: (
        <>
          <span>第 {remediation?.currentRound ?? 1} 輪（當前）</span>
          <Chip tone={status === 'APPROVED' ? 'success' : 'sage'} size="sm">
            {REM_STATUS_LABELS[status]}
          </Chip>
        </>
      ),
      meta: status === 'PENDING' ? '尚待受稽機關開始填報' : undefined,
    });
  }

  return (
    <div className="mt-4 pt-4 border-t border-neutral-100">
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5">
        {/* Left: timeline */}
        <div>
          <p className="text-label text-neutral-500 mb-3">審核歷程</p>
          <Timeline nodes={timelineNodes} />
        </div>

        {/* Right: editor */}
        <div className="flex flex-col gap-4">
          <Textarea
            label="發生原因（根因分析）"
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            disabled={!canEditResp}
            rows={3}
          />
          <div>
            <label className="block text-label text-neutral-700 mb-2">改善措施（可複選）</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {ACTION_TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={!canEditResp}
                  onClick={() => toggleTag(t)}
                  className={cn(
                    'h-7 px-3 text-label rounded-full border transition-colors focus-ring',
                    tags.includes(t)
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400',
                    !canEditResp && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <Textarea
              value={actions}
              onChange={(e) => setActions(e.target.value)}
              disabled={!canEditResp}
              rows={3}
              placeholder="詳細說明改善措施…"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField
              label="預計完成時程"
              type="date"
              value={plannedDueDate}
              onChange={(e) => setPlannedDueDate(e.target.value)}
              disabled={!canEditResp}
            />
            <Textarea
              label="進度追蹤方式"
              value={trackingMethod}
              onChange={(e) => setTrackingMethod(e.target.value)}
              disabled={!canEditResp}
              rows={2}
            />
          </div>
          <Textarea
            label="執行情形"
            value={executionStatus}
            onChange={(e) => setExecutionStatus(e.target.value)}
            disabled={!canEditResp}
            rows={3}
          />

          {/* Evidence */}
          {remediation && (
            <div>
              <p className="text-label text-neutral-700 mb-2">佐證文件</p>
              {evidences.length === 0 ? (
                <p className="text-body-sm text-neutral-400 mb-2">尚未上傳</p>
              ) : (
                <ul className="mb-2 space-y-1">
                  {evidences.map((f) => (
                    <li key={f.id}>
                      <a className="inline-flex items-center gap-1.5 text-body-sm text-primary-700 hover:underline" href={`/api/evidences/${f.id}/download`}>
                        <Paperclip size={14} />
                        {f.originalName}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {canEditResp && (
                <label className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-white border border-dashed border-primary-400 text-primary-700 hover:bg-primary-50 cursor-pointer focus-ring transition-colors">
                  <input type="file" className="hidden" onChange={upload} disabled={uploading} />
                  <Upload size={14} />
                  <span className="text-body-sm">{uploading ? '上傳中…' : '+ 上傳佐證'}</span>
                </label>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {canEditResp && (
              <>
                <Button variant="secondary" loading={saving} onClick={() => save(false)}>
                  儲存草稿
                </Button>
                <Button variant="primary" loading={saving} onClick={() => save(true)}>
                  送出審核
                </Button>
              </>
            )}
            {canAudit && (
              <>
                <Button variant="success" onClick={() => setDecideOpen('APPROVED')}>
                  審核通過
                </Button>
                <Button variant="warning" onClick={() => setDecideOpen('NEEDS_REWORK')}>
                  持續改正
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Decide dialog */}
      <ConfirmDialog
        open={decideOpen === 'APPROVED'}
        onOpenChange={(o) => !o && setDecideOpen(null)}
        title="審核通過"
        description="確認本項改善已符合要求？"
        confirmLabel="通過"
        tone="primary"
        onConfirm={decide}
        loading={saving}
      />
      <ConfirmDialog
        open={decideOpen === 'NEEDS_REWORK'}
        onOpenChange={(o) => !o && setDecideOpen(null)}
        title="要求持續改正"
        description={
          <div className="mt-2">
            <Textarea
              label="持續改正原因"
              value={decideComment}
              onChange={(e) => setDecideComment(e.target.value)}
              rows={3}
              placeholder="例：佐證文件不足，請補附會議紀錄…"
            />
          </div>
        }
        confirmLabel="送出"
        tone="warning"
        onConfirm={decide}
        loading={saving}
      />
    </div>
  );
}
