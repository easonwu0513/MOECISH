'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { SURFACE_INFO } from '@/lib/tone';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Segmented } from '@/components/ui/Segmented';
import { Textarea } from '@/components/ui/Textarea';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { Paperclip, ChevronDown } from '@/components/icons';
import { ProtectedFileLink } from '@/components/cycle/ProtectedFileLink';
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { SaveStatus } from '@/components/ui/SaveStatus';
import { COMPLIANCE_LABELS, COMPLIANCE_TONE, COMPLIANCE_BAR, ORG_UPLOAD_ACCEPT, type ComplianceLevel } from '@/lib/types';
import { fmtROCDateTime } from '@/lib/date';
import { LawReferenceCollapsible, LawReferenceSticky, hasLawRef } from '@/components/checklist/LawBasis';
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
  const [compliance, setCompliance] = useState<ComplianceLevel | null>(
    (response?.compliance ?? null) as ComplianceLevel | null,
  );
  const [description, setDescription] = useState(response?.description ?? '');
  const [recordDocs, setRecordDocs] = useState(response?.recordDocs ?? '');
  // 樂觀並行版號:以本地 state 追蹤,每次存檔成功即用伺服器回傳值更新。
  // (原本固定讀 response?.version prop,存第二次時 prop 尚未經 router.refresh 更新 → 仍送舊版號 →
  //  單一使用者也誤判「資料已被他人更新」409。改本地追蹤後連續存檔版號正確遞增。)
  const [version, setVersion] = useState<number>(response?.version ?? 0);
  // versionRef=存檔當下讀最新版號(收斂驗證高:重疊並發存檔若都讀 render 閉包的 version 會共用 stale 值→
  // 單人單分頁「打字排程存 + 點符合度即時存」重疊即誤判 409;串接+ref 杜絕)。
  const versionRef = useRef<number>(response?.version ?? 0);
  const bumpVersion = (v: number) => { versionRef.current = Math.max(versionRef.current, v); setVersion(versionRef.current); };
  useEffect(() => { bumpVersion(response?.version ?? 0); }, [response?.version]);
  // 存檔串接鏈:前一個 in-flight 完成後才發下一個,避免重疊(每個都讀 versionRef 最新值)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  // 批次標記(全標符合/未答全標不適用)或退回/他處刷新後,伺服器端符合度變動 → 同步本地顯示,
  // 免使用者重新整理才看到結果(符合度由按鈕即時存檔,此同步不會吞掉編輯中的文字)。
  useEffect(() => {
    setCompliance((response?.compliance ?? null) as ComplianceLevel | null);
  }, [response?.compliance]);
  const [textDirty, setTextDirty] = useState(false);
  const [saving, startSaving] = useTransition();
  // 委員意見為委員私人審閱筆記(機關端不可見、不於此回應);此計數供卡頭 Chip 顯示
  const commentCount = (response?.comments ?? []).length;

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
  // 單次存檔(讀 versionRef 最新版號);409-版號衝突(server 回 current)自動以最新版號重試一次
  async function doSave(nextCompliance: ComplianceLevel | null, nextDescription: string, nextRecordDocs: string) {
    const put = (v: number) =>
      fetch(`/api/cycles/${cycleId}/checklist/${encodeURIComponent(item.itemNo)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          compliance: nextCompliance,
          description: nextDescription || null,
          recordDocs: nextRecordDocs || null,
          version: v,
        }),
      });
    let res = await put(versionRef.current);
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string; current?: { version?: number } }));
      // 版號衝突且拿得到現行版號 → 以現行版號重送一次(涵蓋佐證上傳先建 response 使版號跳動之窄窗)
      if (res.status === 409 && j.current && typeof j.current.version === 'number') {
        bumpVersion(j.current.version);
        res = await put(versionRef.current);
      }
      if (!res.ok) {
        const j2 = await res.json().catch(() => ({ error: '儲存失敗' }));
        toast.error('儲存失敗', (j2 as { error?: string }).error ?? '儲存失敗');
        return;
      }
    }
    const saved = await res.json().catch(() => null);
    if (saved && typeof saved.version === 'number') bumpVersion(saved.version);
    setTextDirty(false);
    setJustSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setJustSaved(false), 1200);
    // 存檔後往上捲的元凶在 ChecklistShell 的「捲動聚焦卡片」effect(已限定僅鍵盤導覽觸發),這裡直接 refresh 即可。
    router.refresh();
  }

  function save(nextCompliance = compliance, nextDescription = description, nextRecordDocs = recordDocs) {
    if (!canEdit) return;
    // 串接:掛在前一個存檔之後執行,確保嚴格序列化(不重疊),下一個讀到已更新的 versionRef
    const next = saveChainRef.current.then(() => doSave(nextCompliance, nextDescription, nextRecordDocs)).catch(() => {});
    saveChainRef.current = next;
    startSaving(async () => { await next; });
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
      const j = await res.json().catch(() => ({}));
      toast.error('操作失敗', j.error);
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

  const allTabs: Tab[] = [
    {
      id: 'answer',
      label: '填答',
      content: (
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-label text-ink-500 mb-2">符合情形</label>
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
            label="機關說明（規範內容、執行方式、執行結果）"
            value={description}
            onChange={(e) => { setTextDirty(true); setDescription(e.target.value); scheduleSave(e.target.value, recordDocs); }}
            onBlur={autoSaveOnBlur}
            disabled={!canEdit}
            rows={4}
            placeholder="例：依據本院『資訊安全政策 v3』第 5.2 條，每季進行一次審查…"
          />
          <Textarea
            label="紀錄文件（如規範、紀錄、公文等）"
            value={recordDocs}
            onChange={(e) => { setTextDirty(true); setRecordDocs(e.target.value); scheduleSave(description, e.target.value); }}
            onBlur={autoSaveOnBlur}
            disabled={!canEdit}
            rows={2}
            placeholder={item.expectedEvidence ? `參考應備文件：${item.expectedEvidence.split('\n')[0]}…` : '例：資訊安全管理程序書、內部稽核報告…'}
          />
          {canEdit && (
            <div className="flex items-center gap-2">
              <Button variant="filled" size="sm" loading={saving} onClick={() => save()}>
                儲存
              </Button>
              {/* 存檔狀態只由卡頭那顆點呈現(收合也看得到);此處不重述 */}
            </div>
          )}
          {/* UAT 圖68:機關填報把紀錄佐證併入填答之下——填「紀錄文件」時同畫面可見已上傳佐證,免切分頁 */}
          {userRole === 'ORG_ADMIN' && (
            <div className="mt-1 border-t border-rule pt-3">
              <EvidenceBlock
                cycleId={cycleId}
                itemNo={item.itemNo}
                initialResponseId={response?.id ?? null}
                currentCompliance={compliance}
                currentDescription={description}
                currentRecordDocs={recordDocs}
                currentVersion={version}
                onSaved={bumpVersion}
                canEdit={canEdit}
                viewOnly={false}
                expectedEvidence={item.expectedEvidence}
              />
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
            <p className="text-body-sm text-ink-500">本題尚無委員意見。</p>
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
                  <span className="text-caption text-ink-500">
                    {c.authorName ? `${c.authorName} · ` : ''}{fmtROCDateTime(c.createdAt)}
                  </span>
                  {c.resolvedAt ? (
                    <Chip tone="success" size="sm">已補正</Chip>
                  ) : userRole === 'ORG_ADMIN' ? (
                    <Button size="sm" variant="ghost" onClick={() => resolveComment(c.id)}>
                      標記為已補正
                    </Button>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-ink-500 leading-relaxed">{c.content}</p>
              </div>
            ))
          )}
          {/* 委員審閱筆記僅委員可新增(UAT:最高管理員不像委員審閱,不需新增委員意見;既有意見中心仍可讀,見上方 map) */}
          {userRole === 'AUDITOR' &&
            (response ? (
              <div className="pt-1">
                <CommentForm responseId={response.id} />
              </div>
            ) : (
              <p className="text-caption text-ink-500">（機關尚未作答，暫無法留言）</p>
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
          onSaved={bumpVersion}
          canEdit={canEdit}
          viewOnly={userRole === 'AUDITOR'}
          expectedEvidence={item.expectedEvidence}
        />
      ),
    },
  ];
  // 委員審閱意見為委員私人註記,不開放受稽機關檢視 → 機關端隱藏「委員意見」分頁
  // UAT 圖68:機關端紀錄佐證已併入「填答」之下 → 隱藏獨立「紀錄佐證」分頁(委員/中心維持分頁)
  const tabs = allTabs.filter(
    (t) => !(userRole === 'ORG_ADMIN' && (t.id === 'comments' || t.id === 'evidence')),
  );

  return (
    <div
      data-item-id={item.id}
      className={cn(
        'relative bg-card rounded-md border transition-all duration-200 ease-standard overflow-hidden',
        focused ? 'border-primary-400 shadow-elev-2' : 'border-rule',
        !focused && expanded && 'shadow-elev-1',
        !focused && !expanded && 'hover:border-rule-strong',
      )}
    >
      {/* top compliance stripe — replaces the old full-height left bar */}
      <span
        className={cn(
          'block h-[3px]',
          compliance ? complianceColor[compliance] : 'bg-paper-sunk',
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
          <p className="text-body text-ink-900 leading-relaxed">{item.content}</p>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {compliance ? (
              <Chip tone={complianceTone(compliance)} size="sm" dot>
                {COMPLIANCE_LABELS[compliance]}
              </Chip>
            ) : (
              <Chip tone="neutral" size="sm">未作答</Chip>
            )}
            {commentCount > 0 && (
              <Chip tone="neutral" size="sm">委員意見 {commentCount}</Chip>
            )}
            {evidenceCount > 0 && (
              <span className="inline-flex items-center gap-1 text-caption text-ink-500">
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
              <span className="text-caption text-ink-500">唯讀</span>
            )}
          </div>
        </div>
        <ChevronDown
          size={18}
          className={cn(
            'text-ink-500 mt-1 transition-transform shrink-0',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-rule">
          {/* 法規對照:填報者最需照法規填。lg 以上移至右欄常駐展開(sticky 跟隨),免上下來回捲;
              窄螢幕維持題卡下方可摺疊面板。無法規資料則不分欄、左欄佔滿。 */}
          <div className={hasLawRef(item) ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5' : ''}>
            <div className="min-w-0">
              <Tabs tabs={tabs} />
              {hasLawRef(item) && (
                <LawReferenceCollapsible
                  auditBasis={item.auditBasis}
                  auditFocus={item.auditFocus}
                  expectedEvidence={item.expectedEvidence}
                  className="mt-3 lg:hidden"
                />
              )}
            </div>
            {hasLawRef(item) && (
              <LawReferenceSticky
                auditBasis={item.auditBasis}
                auditFocus={item.auditFocus}
                expectedEvidence={item.expectedEvidence}
                topClass="lg:top-56"
              />
            )}
          </div>
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
  viewOnly,
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
  viewOnly: boolean;
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
      const j = await res.json().catch(() => ({} as { error?: string; current?: { id?: string; version?: number } }));
      // 版號衝突(先改答建了 response、prop 尚未回灌)→ server 回 current,直接沿用其 id/版號,不誤報上傳失敗
      if (res.status === 409 && j.current?.id) {
        setResponseId(j.current.id);
        if (typeof j.current.version === 'number') onSaved?.(j.current.version);
        return j.current.id;
      }
      toast.error('上傳失敗', (j as { error?: string }).error ?? '無法建立作答紀錄');
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
    if (f.size > 20 * 1024 * 1024) {
      toast.error('上傳失敗', '檔案超過 20MB 上限');
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
        <p className="text-label text-ink-500">紀錄佐證上傳</p>
        <span className="text-caption text-ink-500">每檔 ≤ 20MB · 規範、紀錄、公文、截圖…</span>
      </div>
      {expectedEvidence && (
        <div className={`mb-3 rounded-sm ${SURFACE_INFO} px-3 py-2`}>
          <p className="text-caption font-medium text-primary-800 mb-0.5">本題應備文件參考</p>
          <p className="text-caption text-primary-800/80 whitespace-pre-wrap leading-relaxed">{expectedEvidence}</p>
        </div>
      )}
      {files.length === 0 ? (
        <p className="text-body-sm text-ink-500 mb-3">尚未上傳任何佐證文件</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {files.map((f) => (
            <li key={f.id}>
              <ProtectedFileLink fileId={f.id} name={f.originalName} viewOnly={viewOnly} />
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div>
          <FileUploadButton size="sm" label="+ 上傳紀錄佐證" busy={uploading} onChange={onUpload} accept={ORG_UPLOAD_ACCEPT} />
          <p className="mt-1 text-caption text-ink-500">僅接受 PDF / JPG / PNG;Word、Excel 等其他格式請先轉換為 PDF/JPG/PNG 再上傳。</p>
        </div>
      )}
    </div>
  );
}
