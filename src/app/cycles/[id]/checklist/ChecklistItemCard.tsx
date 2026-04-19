'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Segmented } from '@/components/ui/Segmented';
import { Textarea } from '@/components/ui/Textarea';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { Paperclip, Upload, ChevronDown } from '@/components/icons';
import { COMPLIANCE_LABELS, type ComplianceLevel } from '@/lib/types';
import { TOAST } from '@/lib/copy';
import type { ClientItem, ClientResponse } from './ChecklistShell';

const complianceColor: Record<ComplianceLevel, string> = {
  COMPLIANT: 'bg-success-500',
  PARTIALLY_COMPLIANT: 'bg-warning-500',
  NON_COMPLIANT: 'bg-danger-500',
  NOT_APPLICABLE: 'bg-outline-variant',
};

export default function ChecklistItemCard({
  cycleId,
  item,
  response,
  canEdit,
  userRole,
  expanded,
  onToggle,
  focused,
}: {
  cycleId: string;
  item: ClientItem;
  response: ClientResponse | null;
  canEdit: boolean;
  userRole: string;
  expanded: boolean;
  onToggle: () => void;
  focused: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [compliance, setCompliance] = useState<ComplianceLevel | null>(
    (response?.compliance ?? null) as ComplianceLevel | null,
  );
  const [description, setDescription] = useState(response?.description ?? '');
  const [saving, startSaving] = useTransition();
  const unresolved = (response?.comments ?? []).filter((c) => !c.resolvedAt).length;

  // Handle inline saved checkmark flash
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  async function save(nextCompliance = compliance, nextDescription = description) {
    if (!canEdit) return;
    startSaving(async () => {
      const res = await fetch(`/api/cycles/${cycleId}/checklist/${encodeURIComponent(item.itemNo)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          compliance: nextCompliance,
          description: nextDescription || null,
          version: response?.version ?? 0,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: '儲存失敗' }));
        toast.error('儲存失敗', j.error);
        return;
      }
      const t = TOAST.savedChecklist(item.itemNo);
      toast.success(t.title, t.description);
      setJustSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setJustSaved(false), 1200);
      router.refresh();
    });
  }

  async function resolveComment(commentId: string) {
    const res = await fetch(`/api/responses/${response!.id}/comments/${commentId}/resolve`, {
      method: 'POST',
    });
    if (res.ok) {
      toast.success('已標記為已補正');
      router.refresh();
    } else {
      toast.error('操作失敗');
    }
  }

  // keyboard 1/2/3/4 to select compliance when expanded
  useEffect(() => {
    if (!expanded || !canEdit) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      const map: Record<string, ComplianceLevel> = { '1': 'COMPLIANT', '2': 'PARTIALLY_COMPLIANT', '3': 'NON_COMPLIANT', '4': 'NOT_APPLICABLE' };
      const lv = map[e.key];
      if (!lv) return;
      e.preventDefault();
      setCompliance(lv);
      save(lv, description);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, canEdit, description]);

  const tabs: Tab[] = [
    {
      id: 'answer',
      label: '填答',
      content: (
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-label text-neutral-700 mb-2">符合情形</label>
            <Segmented<ComplianceLevel>
              value={compliance}
              onChange={(v) => { setCompliance(v); save(v, description); }}
              disabled={!canEdit}
              ariaLabel="符合情形"
              options={[
                { value: 'COMPLIANT', label: '符合', tone: 'success' },
                { value: 'PARTIALLY_COMPLIANT', label: '部分符合', tone: 'warning' },
                { value: 'NON_COMPLIANT', label: '不符合', tone: 'danger' },
                { value: 'NOT_APPLICABLE', label: '不適用', tone: 'neutral' },
              ]}
            />
          </div>
          <Textarea
            label="簡述規範內容、執行方式、執行結果紀錄文件"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canEdit}
            rows={4}
            placeholder="例：依據本院『資訊安全政策 v3』第 5.2 條，每季進行一次審查…"
          />
          {canEdit && (
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" loading={saving} onClick={() => save()}>
                儲存
              </Button>
              {justSaved && (
                <span className="text-success-700 text-body-sm animate-fade-in">✓ 已儲存</span>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'comments',
      label: '委員意見',
      badge: unresolved > 0 ? <Chip tone="warning" size="sm">{unresolved}</Chip> : undefined,
      content: (response?.comments ?? []).length === 0 ? (
        <p className="text-body-sm text-neutral-500 py-4">本題尚無委員意見。</p>
      ) : (
        <div className="space-y-2">
          {response!.comments.map((c) => (
            <div
              key={c.id}
              className={cn(
                'rounded-lg p-3 border text-body-sm',
                c.resolvedAt ? 'bg-success-50 border-success-100' : 'bg-warning-50 border-warning-100',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption text-neutral-500">
                  第 {c.round} 輪 · {new Date(c.createdAt).toLocaleString('zh-TW')}
                </span>
                {c.resolvedAt ? (
                  <Chip tone="success" size="sm">已補正</Chip>
                ) : (userRole === 'RESPONDENT' || userRole === 'SUPERVISOR') ? (
                  <Button size="sm" variant="ghost" onClick={() => resolveComment(c.id)}>
                    標記為已補正
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-neutral-800">{c.content}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'evidence',
      label: '紀錄佐證',
      content: (
        <EvidenceBlock
          cycleId={cycleId}
          itemNo={item.itemNo}
          initialResponseId={response?.id ?? null}
          currentCompliance={compliance}
          currentDescription={description}
          currentVersion={response?.version ?? 0}
          canEdit={canEdit}
        />
      ),
    },
  ];

  return (
    <div
      data-item-id={item.id}
      className={cn(
        'relative bg-surface-container-lowest rounded-md border transition-all duration-180 ease-standard overflow-hidden',
        focused ? 'border-primary-400 shadow-elev-2' : 'border-outline-variant/60',
        !focused && expanded && 'shadow-elev-1',
        !focused && !expanded && 'hover:border-outline-variant',
      )}
    >
      {/* top compliance stripe — replaces the old full-height left bar */}
      <span
        className={cn(
          'block h-[3px]',
          compliance ? complianceColor[compliance] : 'bg-surface-container-high',
        )}
        aria-hidden
      />

      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 text-left px-4 py-3.5 focus-ring"
        aria-expanded={expanded}
      >
        <Chip tone="neutral" size="sm" className="font-mono shrink-0 mt-0.5">
          {item.itemNo}
        </Chip>
        <div className="flex-1 min-w-0">
          <p className="text-body text-neutral-900 leading-relaxed">{item.content}</p>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {compliance ? (
              <Chip tone={complianceTone(compliance)} size="sm" dot>
                {COMPLIANCE_LABELS[compliance]}
              </Chip>
            ) : (
              <Chip tone="neutral" size="sm">未作答</Chip>
            )}
            {unresolved > 0 && (
              <Chip tone="warning" size="sm">意見待補 {unresolved}</Chip>
            )}
            {response && (description || compliance) && !canEdit && (
              <span className="text-caption text-neutral-400">唯讀</span>
            )}
          </div>
        </div>
        <ChevronDown
          size={18}
          className={cn(
            'text-neutral-400 mt-1 transition-transform shrink-0',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-outline-variant/60">
          <Tabs tabs={tabs} />
        </div>
      )}
    </div>
  );
}

function complianceTone(c: ComplianceLevel): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (c) {
    case 'COMPLIANT': return 'success';
    case 'PARTIALLY_COMPLIANT': return 'warning';
    case 'NON_COMPLIANT': return 'danger';
    case 'NOT_APPLICABLE': return 'neutral';
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
  currentCompliance: ComplianceLevel | null;
  currentDescription: string;
  currentVersion: number;
  canEdit: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [responseId, setResponseId] = useState<string | null>(initialResponseId);
  const [files, setFiles] = useState<{ id: string; originalName: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!responseId) { setFiles([]); return; }
    fetch(`/api/evidences?targetType=CHECKLIST_RESPONSE&targetId=${responseId}`)
      .then((r) => r.json())
      .then((j) => setFiles(j.items ?? []))
      .catch(() => {});
  }, [responseId]);

  async function ensureResponse(): Promise<string | null> {
    if (responseId) return responseId;
    const res = await fetch(`/api/cycles/${cycleId}/checklist/${encodeURIComponent(itemNo)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        compliance: currentCompliance,
        description: currentDescription || null,
        version: currentVersion,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '無法建立作答紀錄' }));
      toast.error('上傳失敗', j.error);
      return null;
    }
    const saved = await res.json();
    setResponseId(saved.id);
    return saved.id as string;
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error('上傳失敗', '檔案超過 5MB 上限');
      e.target.value = '';
      return;
    }
    setUploading(true);
    const rid = await ensureResponse();
    if (!rid) { setUploading(false); e.target.value = ''; return; }
    const fd = new FormData();
    fd.append('file', f);
    fd.append('targetType', 'CHECKLIST_RESPONSE');
    fd.append('targetId', rid);
    const res = await fetch('/api/evidences', { method: 'POST', body: fd });
    setUploading(false);
    if (res.ok) {
      const j = await res.json();
      setFiles((prev) => [...prev, j.item]);
      toast.success('已上傳佐證', f.name);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '上傳失敗' }));
      toast.error('上傳失敗', j.error);
    }
    e.target.value = '';
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-label text-neutral-700">紀錄佐證上傳</p>
        <span className="text-caption text-neutral-400">每檔 ≤ 5MB · 規範、紀錄、公文、截圖…</span>
      </div>
      {files.length === 0 ? (
        <p className="text-body-sm text-neutral-400 mb-3">尚未上傳任何佐證文件</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {files.map((f) => (
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
      {canEdit && (
        <label className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-white border border-dashed border-primary-400 text-primary-700 hover:bg-primary-50 cursor-pointer focus-ring transition-colors">
          <input type="file" className="hidden" onChange={onUpload} disabled={uploading} />
          <Upload size={14} />
          <span className="text-body-sm">{uploading ? '上傳中…' : '+ 上傳紀錄佐證'}</span>
        </label>
      )}
    </div>
  );
}
