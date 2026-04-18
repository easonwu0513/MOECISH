'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { REM_STATUS_LABELS } from '@/lib/state-machine';
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
  decidedAt: Date;
};

type Remediation = {
  id: string;
  status: string;
  rootCause: string | null;
  actions: string | null;
  actionTagsJson: string | null;
  plannedDueDate: Date | null;
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
  const [err, setErr] = useState<string | null>(null);

  const [evidences, setEvidences] = useState<{ id: string; originalName: string }[]>([]);
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
    setErr(null); setSaving(true);
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
      setErr(j.error ?? '儲存失敗');
      return;
    }
    router.refresh();
  }

  async function decide(decision: 'APPROVED' | 'NEEDS_REWORK') {
    const c = decision === 'NEEDS_REWORK'
      ? prompt('請填寫持續改正原因：') ?? ''
      : prompt('（可留空）核可說明：') ?? '';
    if (decision === 'NEEDS_REWORK' && !c) return;

    const res = await fetch(`/api/findings/${finding.id}/remediation/decisions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision, comment: c }),
    });
    if (res.ok) router.refresh();
    else alert((await res.json()).error ?? '失敗');
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !remediation) return;
    const fd = new FormData();
    fd.append('file', f);
    fd.append('targetType', 'REMEDIATION');
    fd.append('targetId', remediation.id);
    const res = await fetch('/api/evidences', { method: 'POST', body: fd });
    if (res.ok) {
      const j = await res.json();
      setEvidences((prev) => [...prev, j.item]);
    }
    e.target.value = '';
  }

  return (
    <div className="mt-4 pt-4 border-t bg-slate-50/50 -mx-5 px-5 pb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-slate-500">改善情形（第 {remediation?.currentRound ?? 1} 輪）</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(status)}`}>
          {REM_STATUS_LABELS[status]}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">發生原因（根因分析）</label>
          <textarea
            disabled={!canEditResp}
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            rows={3}
            className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-white disabled:text-slate-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">預計完成時程</label>
          <input
            type="date"
            disabled={!canEditResp}
            value={plannedDueDate}
            onChange={(e) => setPlannedDueDate(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-white disabled:text-slate-500"
          />
          <label className="block text-xs text-slate-500 mb-1 mt-2">進度追蹤方式</label>
          <textarea
            disabled={!canEditResp}
            value={trackingMethod}
            onChange={(e) => setTrackingMethod(e.target.value)}
            rows={2}
            className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-white disabled:text-slate-500"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-xs text-slate-500 mb-1">改善措施（可複選）</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {ACTION_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              disabled={!canEditResp}
              onClick={() => toggleTag(t)}
              className={`px-2 py-1 text-xs rounded border ${
                tags.includes(t)
                  ? 'bg-brand-600 text-white border-transparent'
                  : 'bg-white hover:border-brand-500 disabled:opacity-60'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          disabled={!canEditResp}
          value={actions}
          onChange={(e) => setActions(e.target.value)}
          rows={3}
          placeholder="詳細說明改善措施…"
          className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-white disabled:text-slate-500"
        />
      </div>

      <div className="mt-3">
        <label className="block text-xs text-slate-500 mb-1">執行情形</label>
        <textarea
          disabled={!canEditResp}
          value={executionStatus}
          onChange={(e) => setExecutionStatus(e.target.value)}
          rows={3}
          className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-white disabled:text-slate-500"
        />
      </div>

      {remediation && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-1">佐證</p>
          {evidences.length > 0 ? (
            <ul className="space-y-0.5 text-sm mb-2">
              {evidences.map((f) => (
                <li key={f.id}>
                  <a className="text-brand-600 hover:underline" href={`/api/evidences/${f.id}/download`}>📎 {f.originalName}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400 mb-2">尚未上傳佐證</p>
          )}
          {canEditResp && (
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-brand-600">
              <input type="file" className="hidden" onChange={upload} />
              + 上傳佐證
            </label>
          )}
        </div>
      )}

      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {canEditResp && (
          <>
            <button
              onClick={() => save(false)}
              disabled={saving}
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm rounded-md disabled:opacity-60"
            >
              儲存草稿
            </button>
            <button
              onClick={() => save(true)}
              disabled={saving}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-md disabled:opacity-60"
            >
              送出審核
            </button>
          </>
        )}
        {canAudit && (
          <>
            <button
              onClick={() => decide('APPROVED')}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md"
            >
              審核通過
            </button>
            <button
              onClick={() => decide('NEEDS_REWORK')}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-md"
            >
              持續改正
            </button>
          </>
        )}
      </div>

      {remediation && remediation.decisions.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-slate-500">審核紀錄</p>
          {remediation.decisions.map((d) => (
            <div
              key={d.id}
              className={`text-sm rounded-md p-2 ${
                d.decision === 'APPROVED'
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-amber-50 border border-amber-200'
              }`}
            >
              <div className="text-xs text-slate-500">
                第 {d.round} 輪 · {d.decision === 'APPROVED' ? '審核通過' : '持續改正'} · {new Date(d.decidedAt).toLocaleString('zh-TW')}
              </div>
              {d.comment && <p className="mt-1 whitespace-pre-wrap">{d.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusBadge(s: RemediationStatus) {
  switch (s) {
    case 'PENDING': return 'bg-slate-200 text-slate-700';
    case 'DRAFT': return 'bg-yellow-100 text-yellow-800';
    case 'SUBMITTED': return 'bg-blue-100 text-blue-700';
    case 'APPROVED': return 'bg-green-100 text-green-700';
    case 'NEEDS_REWORK': return 'bg-amber-100 text-amber-800';
  }
}
