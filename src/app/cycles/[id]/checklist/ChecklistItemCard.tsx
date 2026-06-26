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
import { Paperclip, ChevronDown } from '@/components/icons';
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { SaveStatus } from '@/components/ui/SaveStatus';
import { COMPLIANCE_LABELS, COMPLIANCE_TONE, COMPLIANCE_BAR, ORG_UPLOAD_ACCEPT, type ComplianceLevel } from '@/lib/types';
import { fmtROCDateTime } from '@/lib/date';
import { LawPanel } from '@/components/checklist/LawBasis';
import CommentForm from '../review/CommentForm';
import type { ClientItem, ClientResponse } from './ChecklistShell';

const complianceColor = COMPLIANCE_BAR;

export default function ChecklistItemCard({
  cycleId,
  item,
  response,
  canEdit,
  userRole,
  expanded,
  onToggle,
  focused,
  evidenceCount = 0,
}: {
  cycleId: string;
  item: ClientItem;
  response: ClientResponse | null;
  canEdit: boolean;
  userRole: string;
  expanded: boolean;
  onToggle: () => void;
  focused: boolean;
  evidenceCount?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  // router.refresh() 會重繪伺服器樹,若上方有其他展開卡片會造成捲動錨點上跳(逐題填答很擾民)。
  // 存檔後保留當前捲動位置,於重繪後數個影格內回復,消除「按符合/儲存時頁面往上跳」。
  function refreshKeepScroll() {
    const y = window.scrollY;
    router.refresh();
    const restore = () => window.scrollTo(0, y);
    requestAnimationFrame(restore);
    setTimeout(restore, 80);
    setTimeout(restore, 220);
  }
  const [compliance, setCompliance] = useState<ComplianceLevel | null>(
    (response?.compliance ?? null) as ComplianceLevel | null,
  );
  const [description, setDescription] = useState(response?.description ?? '');
  const [recordDocs, setRecordDocs] = useState(response?.recordDocs ?? '');
  // 樂觀並行版號:以本地 state 追蹤,每次存檔成功即用伺服器回傳值更新。
  // (原本固定讀 response?.version prop,存第二次時 prop 尚未經 router.refresh 更新 → 仍送舊版號 →
  //  單一使用者也誤判「資料已被他人更新」409。改本地追蹤後連續存檔版號正確遞增。)
  const [version, setVersion] = useState<number>(response?.version ?? 0);
  useEffect(() => { setVersion((v) => Math.max(v, response?.version ?? 0)); }, [response?.version]);
  const [textDirty, setTextDirty] = useState(false);
  const [saving, startSaving] = useTransition();
  const unresolved = (response?.comments ?? []).filter((c) => !c.resolvedAt).length;
  // 機關補正回應(針對委員意見的文字回應,與原填答區隔)
  const [revText, setRevText] = useState(response?.orgRevisionNote ?? '');
  const [revOpen, setRevOpen] = useState(false);
  const [revSaving, setRevSaving] = useState(false);

  // Handle inline saved checkmark flash
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  // 離開保護:文字欄失焦才自動存,聚焦中關閉/重整分頁(未觸發 blur)會吞掉未存內容。
  // 用 ref 避免 stale closure;dirty 時攔截關閉。
  const textDirtyRef = useRef(false);
  useEffect(() => { textDirtyRef.current = textDirty; }, [textDirty]);
  useEffect(() => {
    if (!canEdit) return;
    const h = (e: BeforeUnloadEvent) => {
      if (textDirtyRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [canEdit]);

  // 成功一律安靜(卡片內 ✓ 已儲存 就地閃示),失敗才跳 toast —
  // 87 題逐題點選若每次都跳通知會轟炸使用者。
  async function save(nextCompliance = compliance, nextDescription = description, nextRecordDocs = recordDocs) {
    if (!canEdit) return;
    startSaving(async () => {
      const res = await fetch(`/api/cycles/${cycleId}/checklist/${encodeURIComponent(item.itemNo)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          compliance: nextCompliance,
          description: nextDescription || null,
          recordDocs: nextRecordDocs || null,
          version,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: '儲存失敗' }));
        toast.error('儲存失敗', j.error);
        return;
      }
      // 以伺服器回傳的新版號更新本地,確保下一次存檔送出正確版號(避免連續存檔誤判 409)
      const saved = await res.json().catch(() => null);
      if (saved && typeof saved.version === 'number') setVersion(saved.version);
      setTextDirty(false);
      setJustSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setJustSaved(false), 1200);
      refreshKeepScroll();
    });
  }

  // 邊打邊存:停止輸入 900ms 後自動儲存;失焦則立即 flush。消除「有沒有存到」的不確定。
  const debTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { if (debTimer.current) clearTimeout(debTimer.current); }, []);
  function scheduleSave(nextDesc: string, nextDocs: string) {
    if (!canEdit) return;
    if (debTimer.current) clearTimeout(debTimer.current);
    debTimer.current = setTimeout(() => save(compliance, nextDesc, nextDocs), 900);
  }
  function autoSaveOnBlur() {
    if (debTimer.current) clearTimeout(debTimer.current);
    if (textDirty && canEdit) save(compliance, description, recordDocs);
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

  async function saveRevision() {
    if (!response) return;
    setRevSaving(true);
    const res = await fetch(`/api/responses/${response.id}/revision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: revText }),
    });
    setRevSaving(false);
    if (res.ok) {
      toast.success(revText.trim() ? '已儲存補正回應' : '已清除補正回應');
      setRevOpen(false);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
    }
  }

  // keyboard 1/2/3/4:只作用在「聚焦中」的展開卡片
  // (原本只看 expanded — 多卡同時展開時按一次會全部一起改)
  useEffect(() => {
    if (!expanded || !canEdit || !focused) return;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, canEdit, focused, description, recordDocs]);

  const tabs: Tab[] = [
    {
      id: 'answer',
      label: '填答',
      content: (
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-label text-on-surface-variant mb-2">符合情形</label>
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
            label="機關說明(規範內容、執行方式、執行結果)"
            value={description}
            onChange={(e) => { setTextDirty(true); setDescription(e.target.value); scheduleSave(e.target.value, recordDocs); }}
            onBlur={autoSaveOnBlur}
            disabled={!canEdit}
            rows={4}
            placeholder="例：依據本院『資訊安全政策 v3』第 5.2 條，每季進行一次審查…"
          />
          <Textarea
            label="紀錄文件(如規範、紀錄、公文等)"
            value={recordDocs}
            onChange={(e) => { setTextDirty(true); setRecordDocs(e.target.value); scheduleSave(description, e.target.value); }}
            onBlur={autoSaveOnBlur}
            disabled={!canEdit}
            rows={2}
            placeholder={item.expectedEvidence ? `參考應備文件:${item.expectedEvidence.split('\n')[0]}…` : '例:資訊安全管理程序書、內部稽核報告…'}
          />
          {canEdit && (
            <div className="flex items-center gap-2">
              <Button variant="filled" size="sm" loading={saving} onClick={() => save()}>
                儲存
              </Button>
              {/* 存檔狀態只由卡頭那顆點呈現(收合也看得到);此處不重述 */}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'comments',
      label: '委員意見',
      // 意見待補數已由卡頭 Chip 呈現(收合可見),此處不重複 tab badge
      content: (
        <div className="space-y-2">
          {(response?.comments ?? []).length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">本題尚無委員意見。</p>
          ) : (
            response!.comments.map((c) => (
              <div
                key={c.id}
                className={cn(
                  'rounded-lg p-3 border text-body-sm',
                  c.resolvedAt ? 'bg-success-50 border-success-100' : 'bg-warning-50 border-warning-100',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-caption text-on-surface-variant">
                    {c.authorName ? `${c.authorName} · ` : ''}第 {c.round} 輪 · {fmtROCDateTime(c.createdAt)}
                  </span>
                  {c.resolvedAt ? (
                    <Chip tone="success" size="sm">已補正</Chip>
                  ) : userRole === 'ORG_ADMIN' ? (
                    <Button size="sm" variant="ghost" onClick={() => resolveComment(c.id)}>
                      標記為已補正
                    </Button>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-on-surface-variant leading-relaxed">{c.content}</p>
              </div>
            ))
          )}
          {userRole === 'ORG_ADMIN' && unresolved > 0 && !canEdit && (
            <div className="rounded-lg bg-primary-50/60 border border-primary-100 px-3 py-2 text-caption text-primary-800 leading-relaxed">
              委員意見已提出:可於下方填「機關補正回應」說明、並至本題「紀錄佐證」分頁補上佐證,完成後按上方「標記為已補正」通知委員複核。若需修改原作答(符合度/說明),請洽中心申請退回重填。
            </div>
          )}

          {/* 機關補正回應(針對委員意見,與原填答區隔);有委員意見才出現 */}
          {response && response.comments.length > 0 && (
            <div className="rounded-lg border border-primary-100 bg-primary-50/40 p-3">
              {revOpen ? (
                <div className="space-y-2">
                  <Textarea
                    label="機關補正回應(針對委員意見,與原填答區隔)"
                    value={revText}
                    onChange={(e) => setRevText(e.target.value)}
                    rows={3}
                    placeholder="說明已如何補正,或對委員意見的回應…"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" loading={revSaving} onClick={saveRevision}>儲存回應</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRevOpen(false); setRevText(response.orgRevisionNote ?? ''); }}>取消</Button>
                  </div>
                </div>
              ) : response.orgRevisionNote ? (
                <div>
                  <p className="text-caption font-medium text-primary-800 mb-1">機關補正回應</p>
                  <p className="text-body-sm text-primary-900 whitespace-pre-wrap leading-relaxed">{response.orgRevisionNote}</p>
                  {userRole === 'ORG_ADMIN' && (
                    <button type="button" onClick={() => setRevOpen(true)} className="mt-1.5 text-caption text-primary-700 hover:underline focus-ring rounded-sm px-1">修改回應</button>
                  )}
                </div>
              ) : userRole === 'ORG_ADMIN' ? (
                <button type="button" onClick={() => setRevOpen(true)} className="text-body-sm text-primary-700 hover:underline focus-ring rounded-sm px-1">＋ 新增機關補正回應(文字)</button>
              ) : (
                <p className="text-caption text-on-surface-variant">機關尚未填寫補正回應。</p>
              )}
            </div>
          )}

          {/* 委員/中心可在此逐輪留意見(已補正後仍可續提,第 N 輪);需機關已作答(有 response) */}
          {(userRole === 'AUDITOR' || userRole === 'SUPER_ADMIN') &&
            (response ? (
              <div className="pt-1">
                <CommentForm responseId={response.id} />
              </div>
            ) : (
              <p className="text-caption text-on-surface-variant">(機關尚未作答,暫無法留言)</p>
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
          currentRecordDocs={recordDocs}
          currentVersion={version}
          onSaved={(v) => setVersion((cur) => Math.max(cur, v))}
          canEdit={canEdit || (userRole === 'ORG_ADMIN' && unresolved > 0)}
          expectedEvidence={item.expectedEvidence}
        />
      ),
    },
  ];

  return (
    <div
      data-item-id={item.id}
      className={cn(
        'relative bg-surface-container-lowest rounded-md border transition-all duration-200 ease-standard overflow-hidden',
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
          <p className="text-body text-on-surface leading-relaxed">{item.content}</p>
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
            {evidenceCount > 0 && (
              <span className="inline-flex items-center gap-1 text-caption text-on-surface-variant">
                <Paperclip size={12} className="shrink-0" />{evidenceCount}
              </span>
            )}
            {canEdit && (
              <SaveStatus
                state={saving ? 'saving' : textDirty ? 'dirty' : justSaved ? 'saved' : 'idle'}
                dirtyLabel="未存"
              />
            )}
            {response && (description || compliance) && !canEdit && (
              <span className="text-caption text-on-surface-variant">唯讀</span>
            )}
          </div>
        </div>
        <ChevronDown
          size={18}
          className={cn(
            'text-on-surface-variant mt-1 transition-transform shrink-0',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-outline-variant/60">
          <Tabs tabs={tabs} />
          {/* 法規對照:填報者最需照法規填,故展開即顯眼(與委員審閱頁同範式),不再藏在分頁 */}
          {(item.auditBasis || item.auditFocus || item.expectedEvidence) && (
            <details className="mt-3 rounded-md border border-primary-100 bg-primary-50/40 overflow-hidden">
              <summary className="cursor-pointer select-none px-3 py-2 text-body-sm font-medium text-primary-800 hover:bg-primary-50 transition-colors">
                法規對照(稽核依據・稽核重點・應備文件)
              </summary>
              <div className="px-3 pb-3 pt-1 bg-surface-container-lowest">
                <LawPanel
                  auditBasis={item.auditBasis}
                  auditFocus={item.auditFocus}
                  expectedEvidence={item.expectedEvidence}
                />
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function complianceTone(c: ComplianceLevel) {
  return COMPLIANCE_TONE[c];
}

function EvidenceBlock({
  cycleId,
  itemNo,
  initialResponseId,
  currentCompliance,
  currentDescription,
  currentRecordDocs,
  currentVersion,
  onSaved,
  canEdit,
  expectedEvidence,
}: {
  cycleId: string;
  itemNo: string;
  initialResponseId: string | null;
  currentCompliance: ComplianceLevel | null;
  currentDescription: string;
  currentRecordDocs: string;
  currentVersion: number;
  onSaved?: (version: number) => void;
  canEdit: boolean;
  expectedEvidence: string | null;
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
        recordDocs: currentRecordDocs || null,
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
    if (typeof saved.version === 'number') onSaved?.(saved.version); // 同步版號回卡片,避免後續存檔 409
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
        <p className="text-label text-on-surface-variant">紀錄佐證上傳</p>
        <span className="text-caption text-on-surface-variant">每檔 ≤ 5MB · 規範、紀錄、公文、截圖…</span>
      </div>
      {expectedEvidence && (
        <div className="mb-3 rounded-sm bg-primary-50/60 border border-primary-100 px-3 py-2">
          <p className="text-caption font-medium text-primary-800 mb-0.5">本題應備文件參考</p>
          <p className="text-caption text-primary-800/80 whitespace-pre-wrap leading-relaxed">{expectedEvidence}</p>
        </div>
      )}
      {files.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant mb-3">尚未上傳任何佐證文件</p>
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
        <div>
          <FileUploadButton size="sm" label="+ 上傳紀錄佐證" busy={uploading} onChange={onUpload} accept={ORG_UPLOAD_ACCEPT} />
          <p className="mt-1 text-caption text-on-surface-variant">僅接受 PDF / JPG / PNG;Word、Excel 等其他格式請先轉換為 PDF/JPG/PNG 再上傳。</p>
        </div>
      )}
    </div>
  );
}
