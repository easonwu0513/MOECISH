'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { COMPLIANCE_LABELS, type ComplianceLevel, COMPLIANCE_LEVELS } from '@/lib/types';

type Comment = {
  id: string;
  content: string;
  round: number;
  resolvedAt: Date | null;
  createdAt: Date;
};

type Response = {
  id: string;
  compliance: string | null;
  description: string | null;
  version: number;
  comments: Comment[];
};

type Item = {
  id: string;
  itemNo: string;
  content: string;
};

export default function ChecklistItemRow({
  cycleId,
  item,
  response,
  canEdit,
  userRole,
}: {
  cycleId: string;
  item: Item;
  response: Response | null;
  canEdit: boolean;
  userRole: string;
}) {
  const router = useRouter();
  const [compliance, setCompliance] = useState<string | null>(response?.compliance ?? null);
  const [description, setDescription] = useState(response?.description ?? '');
  const [expanded, setExpanded] = useState(false);
  const [saving, startSaving] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const unresolved = (response?.comments ?? []).filter((c) => !c.resolvedAt).length;

  async function save() {
    setErr(null);
    startSaving(async () => {
      const res = await fetch(`/api/cycles/${cycleId}/checklist/${encodeURIComponent(item.itemNo)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          compliance,
          description,
          version: response?.version ?? 0,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: '儲存失敗' }));
        setErr(j.error ?? '儲存失敗');
        return;
      }
      router.refresh();
    });
  }

  async function resolveComment(commentId: string) {
    const res = await fetch(`/api/responses/${response!.id}/comments/${commentId}/resolve`, {
      method: 'POST',
    });
    if (res.ok) router.refresh();
  }

  return (
    <div className="bg-white border rounded-lg">
      <div
        className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-slate-50"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-[3.5rem] font-mono text-sm font-semibold text-brand-700 pt-0.5">
          {item.itemNo}
        </div>
        <div className="flex-1">
          <p className="text-sm text-slate-800 leading-relaxed">{item.content}</p>
          <div className="mt-1 flex items-center gap-2 text-xs">
            {compliance ? (
              <span className={`px-2 py-0.5 rounded-full ${complianceBadge(compliance)}`}>
                {COMPLIANCE_LABELS[compliance as ComplianceLevel]}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">未作答</span>
            )}
            {unresolved > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                委員意見待補 {unresolved}
              </span>
            )}
          </div>
        </div>
        <div className="text-xs text-slate-400">{expanded ? '收合' : '展開'}</div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t bg-slate-50/50">
          <div className="flex flex-wrap gap-2 mb-3">
            {COMPLIANCE_LEVELS.map((lv) => (
              <label
                key={lv}
                className={`cursor-pointer px-3 py-1.5 text-sm rounded-md border ${
                  compliance === lv
                    ? complianceBadge(lv) + ' border-transparent'
                    : 'bg-white hover:border-brand-500'
                }`}
              >
                <input
                  type="radio"
                  name={`c-${item.id}`}
                  value={lv}
                  className="hidden"
                  disabled={!canEdit}
                  checked={compliance === lv}
                  onChange={() => setCompliance(lv)}
                />
                {COMPLIANCE_LABELS[lv]}
              </label>
            ))}
          </div>

          <label className="block text-xs text-slate-500 mb-1">簡述規範內容、執行方式、執行結果紀錄文件</label>
          <textarea
            disabled={!canEdit}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full border rounded-md px-3 py-2 text-sm disabled:bg-slate-100"
          />

          {canEdit && (
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-md disabled:opacity-60"
              >
                {saving ? '儲存中…' : '儲存'}
              </button>
              {err && <span className="text-sm text-red-600">{err}</span>}
            </div>
          )}

          {canEdit && (
            <EvidenceBlock
              cycleId={cycleId}
              itemNo={item.itemNo}
              initialResponseId={response?.id ?? null}
              currentCompliance={compliance}
              currentDescription={description}
              currentVersion={response?.version ?? 0}
              canEdit={canEdit}
            />
          )}
          {!canEdit && response && (
            <EvidenceBlock
              cycleId={cycleId}
              itemNo={item.itemNo}
              initialResponseId={response.id}
              currentCompliance={compliance}
              currentDescription={description}
              currentVersion={response.version}
              canEdit={false}
            />
          )}

          {response && response.comments.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-semibold text-slate-600 mb-2">稽核委員意見</p>
              <div className="space-y-2">
                {response.comments.map((c) => (
                  <div
                    key={c.id}
                    className={`text-sm rounded-md p-3 ${
                      c.resolvedAt ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        第 {c.round} 輪 · {new Date(c.createdAt).toLocaleString('zh-TW')}
                      </span>
                      {c.resolvedAt ? (
                        <span className="text-xs text-green-700">已補正</span>
                      ) : (
                        (userRole === 'RESPONDENT' || userRole === 'SUPERVISOR') && (
                          <button
                            onClick={() => resolveComment(c.id)}
                            className="text-xs text-green-700 hover:underline"
                          >
                            標記為已補正
                          </button>
                        )
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function complianceBadge(level: string) {
  switch (level) {
    case 'COMPLIANT': return 'bg-green-100 text-green-700';
    case 'PARTIALLY_COMPLIANT': return 'bg-yellow-100 text-yellow-800';
    case 'NON_COMPLIANT': return 'bg-red-100 text-red-700';
    case 'NOT_APPLICABLE': return 'bg-slate-200 text-slate-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function EvidenceBlock({
  cycleId,
  itemNo,
  initialResponseId,
  currentCompliance,
  currentDescription,
  currentVersion,
  canEdit,
}: {
  cycleId: string;
  itemNo: string;
  initialResponseId: string | null;
  currentCompliance: string | null;
  currentDescription: string;
  currentVersion: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [responseId, setResponseId] = useState<string | null>(initialResponseId);
  const [files, setFiles] = useState<{ id: string; originalName: string; storageKey: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!responseId) {
      setFiles([]);
      return;
    }
    fetch(`/api/evidences?targetType=CHECKLIST_RESPONSE&targetId=${responseId}`)
      .then((r) => r.json())
      .then((j) => setFiles(j.items ?? []))
      .catch(() => {});
  }, [responseId]);

  async function ensureResponse(): Promise<string | null> {
    if (responseId) return responseId;
    const saveRes = await fetch(`/api/cycles/${cycleId}/checklist/${encodeURIComponent(itemNo)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        compliance: currentCompliance,
        description: currentDescription || null,
        version: currentVersion,
      }),
    });
    if (!saveRes.ok) {
      const j = await saveRes.json().catch(() => ({ error: '無法建立作答紀錄' }));
      alert(j.error ?? '無法建立作答紀錄');
      return null;
    }
    const saved = await saveRes.json();
    setResponseId(saved.id);
    return saved.id;
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      alert('檔案超過 5MB 上限');
      e.target.value = '';
      return;
    }

    setUploading(true);
    const rid = await ensureResponse();
    if (!rid) {
      setUploading(false);
      e.target.value = '';
      return;
    }

    const fd = new FormData();
    fd.append('file', f);
    fd.append('targetType', 'CHECKLIST_RESPONSE');
    fd.append('targetId', rid);
    const res = await fetch('/api/evidences', { method: 'POST', body: fd });
    setUploading(false);
    if (res.ok) {
      const j = await res.json();
      setFiles((prev) => [...prev, j.item]);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '上傳失敗' }));
      alert(j.error ?? '上傳失敗');
    }
    e.target.value = '';
  }

  return (
    <div className="mt-3 border-t pt-3 bg-white rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">紀錄佐證上傳</p>
        <span className="text-xs text-slate-400">每個檔案上限 5MB</span>
      </div>
      {files.length === 0 ? (
        <p className="text-xs text-slate-400 mb-2">尚未上傳任何佐證文件（規範、紀錄、公文、截圖等）</p>
      ) : (
        <ul className="space-y-1 text-sm mb-2">
          {files.map((f) => (
            <li key={f.id}>
              <a
                className="text-brand-600 hover:underline"
                href={`/api/evidences/${f.id}/download`}
              >
                📎 {f.originalName}
              </a>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer px-3 py-1.5 border border-dashed border-brand-500 text-brand-600 hover:bg-brand-50 rounded-md">
          <input type="file" className="hidden" onChange={onUpload} disabled={uploading} />
          <span>{uploading ? '上傳中…' : '+ 上傳紀錄佐證'}</span>
        </label>
      )}
    </div>
  );
}
