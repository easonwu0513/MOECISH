'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { ProtectedFileLink } from '@/components/cycle/ProtectedFileLink';
import { Paperclip, X, Info } from '@/components/icons';
import { fmtROC, fmtROCDateTime } from '@/lib/date';
import { trackedStatusTone, trackedReviewTone } from '@/lib/tracking';
import {
  DEFICIENCY_ASPECT_LABELS,
  DEFICIENCY_TYPE_LABELS,
  EXEC_STATUSES,
  EXEC_STATUS_LABELS,
  TRACKED_STATUS_LABELS,
  TRACKED_REVIEW_STATUS_LABELS,
  TRACKING_CADENCE_OPTIONS,
  type DeficiencyAspect,
  type DeficiencyType,
  type ExecStatus,
  type TrackedStatus,
  type TrackedReviewStatus,
  type Role,
} from '@/lib/types';

export type EvidenceDTO = { id: string; originalName: string; mimeType: string; sizeBytes: number };
export type ReportDTO = {
  id: string;
  content: string;
  execStatus: string;
  submittedAt: string;
  submitterName: string | null;
  reviewStatus: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  evidences: EvidenceDTO[];
};
export type TrackedDTO = {
  id: string;
  aspect: string;
  type: string;
  itemNo: number;
  description: string;
  checklistRef: string | null;
  originYear: number;
  status: string;
  cadenceMonths: number;
  nextReportDue: string;
  overdue: boolean;
  assignedAuditorId: string | null;
  assignedAuditorName: string | null;
  orgName: string;
  reports: ReportDTO[];
};

export default function TrackedItem({
  item,
  role,
  userId,
  auditors = [],
}: {
  item: TrackedDTO;
  role: Role;
  userId: string;
  auditors?: { id: string; name: string; organizationId: string | null }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const isCenter = role === 'SUPER_ADMIN';
  const isOrg = role === 'ORG_ADMIN';
  const isAuditor = role === 'AUDITOR';
  const canReviewItem = item.status === 'TRACKING' && (isCenter || (isAuditor && item.assignedAuditorId === userId));

  const pendingReport = item.reports.find((r) => r.reviewStatus === 'PENDING') ?? null;

  // 機關新回報表單
  const [content, setContent] = useState('');
  const [execStatus, setExecStatus] = useState<ExecStatus>('IN_PROGRESS');
  const [submitting, setSubmitting] = useState(false);
  // 審核對話框
  const [review, setReview] = useState<{ reportId: string; decision: 'CONTINUE' | 'COMPLETE' | 'RETURN' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [pendingDelEv, setPendingDelEv] = useState<{ id: string; name: string } | null>(null);

  const aspectLabel = DEFICIENCY_ASPECT_LABELS[item.aspect as DeficiencyAspect] ?? item.aspect;
  const typeLabel = DEFICIENCY_TYPE_LABELS[item.type as DeficiencyType] ?? item.type;

  async function submitReport() {
    if (content.trim().length === 0) {
      toast.error('請填寫進度說明');
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/tracking/${item.id}/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: content.trim(), execStatus }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '送出失敗' }));
      toast.error('回報送出失敗', j.error);
      return;
    }
    setContent('');
    toast.success('已送出回報', '可於下方補充佐證，待中心或協審委員審核。');
    router.refresh();
  }

  async function uploadEvidence(reportId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
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
      fd.append('targetType', 'TRACKED_REPORT');
      fd.append('targetId', reportId);
      const res = await fetch('/api/evidences', { method: 'POST', body: fd });
      if (res.ok) ok += 1;
      else {
        const j = await res.json().catch(() => ({ error: '上傳失敗' }));
        toast.error(`「${f.name}」上傳失敗`, j.error);
      }
    }
    setUploading(false);
    e.target.value = '';
    if (ok > 0) {
      toast.success('已上傳佐證', ok > 1 ? `共 ${ok} 個檔案` : files[0].name);
      router.refresh();
    }
  }

  async function removeEvidence(id: string) {
    setPendingDelEv(null);
    const res = await fetch(`/api/evidences/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('已刪除佐證');
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '刪除失敗' }));
      toast.error('刪除失敗', j.error);
    }
  }

  async function submitReview() {
    if (!review) return;
    if (review.decision === 'RETURN' && reviewNote.trim().length < 1) {
      toast.error('退回補正必須填寫理由');
      return;
    }
    setReviewing(true);
    const res = await fetch(`/api/tracking/reports/${review.reportId}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: review.decision, note: reviewNote.trim() || undefined }),
    });
    setReviewing(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '審核失敗' }));
      toast.error('審核失敗', j.error);
      return;
    }
    const msg =
      review.decision === 'COMPLETE' ? '已認可完成，此缺失結束列管。'
      : review.decision === 'CONTINUE' ? '已通過，此缺失續列管追蹤。'
      : '已退回，機關可補充後重新回報。';
    setReview(null);
    setReviewNote('');
    toast.success('已完成審核', msg);
    router.refresh();
  }

  async function updateCfg(patch: { cadenceMonths?: number; assignedAuditorId?: string | null }) {
    setSavingCfg(true);
    const res = await fetch(`/api/tracking/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setSavingCfg(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '更新失敗' }));
      toast.error('更新失敗', j.error);
      router.refresh(); // 還原下拉為伺服器值
      return;
    }
    toast.success('已更新');
    router.refresh();
  }

  return (
    <Card variant="outlined" className={item.overdue ? 'border-l-[3px] border-l-danger-500' : undefined}>
      {/* 標頭 */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-title-md text-ink-900">
              {aspectLabel}・{typeLabel} 第 {item.itemNo} 項
            </h3>
            <Chip size="sm" tone={trackedStatusTone(item.status)} dot>
              {TRACKED_STATUS_LABELS[item.status as TrackedStatus] ?? item.status}
            </Chip>
          </div>
          <p className="mt-1 text-caption text-ink-500">
            來源 {item.originYear - 1911} 年度
            {isCenter && <> · {item.orgName}</>}
            {item.checklistRef && <> · 檢核項 <span className="font-mono">{item.checklistRef}</span></>}
          </p>
        </div>
        <div className="text-right shrink-0">
          {item.status === 'TRACKING' ? (
            <p className={`text-body-sm tabular-nums ${item.overdue ? 'text-danger-600 font-medium' : 'text-ink-700'}`}>
              下次回報 {fmtROC(item.nextReportDue)}
              {item.overdue && ' · 已逾期'}
            </p>
          ) : (
            <p className="text-body-sm text-success-700">已完成結案</p>
          )}
          <p className="mt-0.5 text-caption text-ink-500">
            回報週期 {item.cadenceMonths} 個月
            {!isOrg && (
              <> · 協審 {item.assignedAuditorName ?? '未指派'}</>
            )}
          </p>
        </div>
      </div>

      {/* 缺失快照 */}
      <div className="mt-3 rounded-md bg-paper-sunk px-3.5 py-2.5">
        <p className="text-body-sm text-ink-900 leading-relaxed whitespace-pre-wrap">{item.description}</p>
      </div>

      {/* 中心:回報週期 + 協審委員 */}
      {isCenter && item.status === 'TRACKING' && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Select
            label="回報週期（月）"
            value={item.cadenceMonths}
            disabled={savingCfg}
            onChange={(e) => updateCfg({ cadenceMonths: Number(e.target.value) })}
          >
            {TRACKING_CADENCE_OPTIONS.map((m) => (
              <option key={m} value={m}>{m} 個月</option>
            ))}
          </Select>
          <Select
            label="協審委員（選填）"
            value={item.assignedAuditorId ?? ''}
            disabled={savingCfg}
            onChange={(e) => updateCfg({ assignedAuditorId: e.target.value || null })}
          >
            <option value="">不指派（僅中心審核）</option>
            {auditors.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </div>
      )}

      {/* 機關:新回報表單(無待審回報且列管中) */}
      {isOrg && item.status === 'TRACKING' && !pendingReport && (
        <div className="mt-4 rounded-md border border-rule bg-card p-3.5">
          <p className="text-label text-ink-900 mb-2">提交進度回報</p>
          <div className="grid gap-3">
            <Textarea
              label="進度說明"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="請說明本期改善進度、已完成事項與後續規劃…"
            />
            <Select label="執行情形" value={execStatus} onChange={(e) => setExecStatus(e.target.value as ExecStatus)}>
              {EXEC_STATUSES.map((s) => (
                <option key={s} value={s}>{EXEC_STATUS_LABELS[s]}</option>
              ))}
            </Select>
            <div>
              <Button onClick={submitReport} disabled={submitting} loading={submitting}>送出回報</Button>
            </div>
          </div>
        </div>
      )}

      {/* 回報歷程 */}
      {item.reports.length > 0 && (
        <div className="mt-4">
          <p className="text-label text-ink-500 mb-2">回報歷程</p>
          <ul className="space-y-3">
            {item.reports.map((r) => {
              const canUpload = isOrg && r.reviewStatus === 'PENDING';
              const viewerCanReviewThis = canReviewItem && r.reviewStatus === 'PENDING';
              return (
                <li key={r.id} className="rounded-md border border-rule bg-card p-3.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Chip size="sm" tone={trackedReviewTone(r.reviewStatus)}>
                        {TRACKED_REVIEW_STATUS_LABELS[r.reviewStatus as TrackedReviewStatus] ?? r.reviewStatus}
                      </Chip>
                      <span className="text-caption text-ink-500">
                        執行情形：{EXEC_STATUS_LABELS[r.execStatus as ExecStatus] ?? r.execStatus}
                      </span>
                    </div>
                    <span className="text-caption text-ink-500 tabular-nums">
                      {fmtROCDateTime(r.submittedAt)}{r.submitterName ? ` · ${r.submitterName}` : ''}
                    </span>
                  </div>

                  <p className="mt-2 text-body-sm text-ink-900 leading-relaxed whitespace-pre-wrap">{r.content}</p>

                  {/* 佐證 */}
                  {r.evidences.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {r.evidences.map((f) => (
                        <li key={f.id} className="flex items-center gap-2">
                          <ProtectedFileLink fileId={f.id} name={f.originalName} viewOnly={isAuditor} />
                          {canUpload && (
                            <button
                              type="button"
                              onClick={() => setPendingDelEv({ id: f.id, name: f.originalName })}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-500 hover:text-danger-600 hover:bg-danger-50 transition-colors focus-ring"
                              aria-label={`刪除佐證 ${f.originalName}`}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canUpload && r.evidences.length === 0 && (
                    <div className="mt-2 flex items-center gap-2 text-caption text-ink-500">
                      <Paperclip size={14} className="opacity-70" /> 尚未上傳佐證
                    </div>
                  )}
                  {canUpload && (
                    <div className="mt-2">
                      <FileUploadButton
                        size="sm"
                        label="+ 上傳佐證（可多選）"
                        busy={uploading}
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        onChange={(e) => uploadEvidence(r.id, e)}
                      />
                    </div>
                  )}

                  {/* 審核意見(已審者顯示) */}
                  {r.reviewStatus !== 'PENDING' && r.reviewNote && (
                    <div className="mt-2 flex items-start gap-2 rounded-md bg-paper-sunk px-3 py-2 text-caption text-ink-700">
                      <Info size={14} className="mt-0.5 shrink-0" />
                      <span>
                        審核意見：{r.reviewNote}
                        {r.reviewedAt && (
                          <span className="text-ink-500">
                            （{fmtROCDateTime(r.reviewedAt)}{r.reviewerName ? ` · ${r.reviewerName}` : ''}）
                          </span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* 待審 + 有審核權 → 三態審核按鈕 */}
                  {viewerCanReviewThis && (
                    <div className="mt-3 flex gap-2 flex-wrap border-t border-rule pt-3">
                      <Button size="sm" onClick={() => { setReviewNote(''); setReview({ reportId: r.id, decision: 'CONTINUE' }); }}>
                        通過・續列管
                      </Button>
                      <Button size="sm" variant="tonal" onClick={() => { setReviewNote(''); setReview({ reportId: r.id, decision: 'COMPLETE' }); }}>
                        認可完成
                      </Button>
                      <Button size="sm" variant="outlined" onClick={() => { setReviewNote(''); setReview({ reportId: r.id, decision: 'RETURN' }); }}>
                        退回補正
                      </Button>
                    </div>
                  )}
                  {isOrg && r.reviewStatus === 'PENDING' && (
                    <p className="mt-2 text-caption text-ink-500">此回報待中心/協審委員審核中。</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 審核確認對話框 */}
      <ConfirmDialog
        open={review !== null}
        onOpenChange={(o) => { if (!reviewing && !o) setReview(null); }}
        title={
          review?.decision === 'COMPLETE' ? '認可完成' :
          review?.decision === 'RETURN' ? '退回補正' : '通過・續列管'
        }
        description={
          <div className="mt-2 flex flex-col gap-3">
            <p className="text-body-sm text-ink-500">
              {review?.decision === 'COMPLETE'
                ? '確認此缺失已改善完成？通過後將結束列管、不再要求回報。'
                : review?.decision === 'RETURN'
                ? '退回本次回報，機關可補充後重新提交。'
                : `通過本次回報，續列管追蹤；下次回報期限將順延 ${item.cadenceMonths} 個月。`}
            </p>
            <Textarea
              label={review?.decision === 'RETURN' ? '退回理由（必填）' : '審核意見（選填）'}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
            />
          </div>
        }
        confirmLabel={review?.decision === 'COMPLETE' ? '認可完成' : review?.decision === 'RETURN' ? '退回' : '通過'}
        tone={review?.decision === 'RETURN' ? 'danger' : 'primary'}
        onConfirm={submitReview}
        loading={reviewing}
      />

      {/* 刪除佐證確認 */}
      <ConfirmDialog
        open={pendingDelEv !== null}
        onOpenChange={(o) => { if (!o) setPendingDelEv(null); }}
        title="刪除佐證"
        description={pendingDelEv ? `確定刪除「${pendingDelEv.name}」？此動作無法復原。` : ''}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={() => { if (pendingDelEv) removeEvidence(pendingDelEv.id); }}
      />
    </Card>
  );
}
