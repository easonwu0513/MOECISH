'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { Plus, Paperclip, Check, AlertCircle, FileText, X } from '@/components/icons';
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { PREP_STATUS_LABELS, prepOrgEditable, type PrepStatus } from '@/lib/types';
import { fmtROCDateTime } from '@/lib/date';

type Sub = {
  id: string;
  status: string;
  note: string | null;
  noFileReason: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
};
type Item = {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  submission: Sub | null;
};
type FileRec = { id: string; targetId: string; originalName: string; sizeBytes: number };

function statusTone(s: PrepStatus): 'neutral' | 'primary' | 'success' | 'danger' | 'warning' {
  switch (s) {
    case 'EMPTY': return 'neutral';
    case 'UPLOADED': return 'warning';
    case 'SUBMITTED': return 'primary';
    case 'CONFIRMED': return 'success';
    case 'INSUFFICIENT': return 'danger';
  }
}

export default function PrepBoard({
  cycleId,
  role,
  cycleStatus,
  initialItems,
  initialFiles,
}: {
  cycleId: string;
  role: string;
  cycleStatus: string;
  initialItems: Item[];
  initialFiles: FileRec[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // 上傳/審核以單項為單位顯示忙碌,避免一項上傳全板按鈕跟著轉圈
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  // SUPER_ADMIN 新增需求
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');

  // 中心退回 dialog
  const [returnOpen, setReturnOpen] = useState<string | null>(null); // submissionId
  const [returnNote, setReturnNote] = useState('');
  // 機關「無相關文件理由」編輯中的項目
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState('');
  // 機關「確定繳交」確認
  const [submitOpen, setSubmitOpen] = useState(false);
  // 破壞性刪除確認
  const [pendingFile, setPendingFile] = useState<{ id: string; name: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ id: string; title: string } | null>(null);

  const isAdmin = role === 'SUPER_ADMIN';
  const isOrg = role === 'ORG_ADMIN';
  // 資料準備改由最高管理員(中心)單一審核,委員不參與此關 → 消除多委員確認衝突
  const orgCanEdit = isOrg && (cycleStatus === 'PREPARATION' || cycleStatus === 'DRAFT');
  // 中心審核(確認/退回)僅限資料準備階段;離開後資料凍結,不可再審,避免把已確認項退回卡死
  const adminCanReview = isAdmin && cycleStatus === 'PREPARATION';

  const filesOf = (subId?: string) =>
    subId ? initialFiles.filter((f) => f.targetId === subId) : [];

  // 一項是否「已處理」(有檔案 或 已敘明無檔理由;已繳交/已確認亦視為已處理)
  const addressedOf = (it: Item) => {
    const sub = it.submission;
    if (!sub) return false;
    if (sub.status === 'SUBMITTED' || sub.status === 'CONFIRMED') return true;
    return filesOf(sub.id).length > 0 || !!sub.noFileReason?.trim();
  };
  // 確定繳交:必填項須全處理;可繳交數 = 已處理且尚未繳交/確認者
  const requiredUnaddressed = initialItems.filter((it) => it.required && !addressedOf(it));
  const draftCount = initialItems.filter((it) => {
    const s = it.submission?.status;
    return s !== 'SUBMITTED' && s !== 'CONFIRMED' && addressedOf(it);
  }).length;
  const canSubmit = isOrg && cycleStatus === 'PREPARATION' && draftCount > 0 && requiredUnaddressed.length === 0;

  async function applyStandard() {
    setBusy(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/prep?standard=1`, { method: 'POST' });
      if (res.ok) {
        const j = await res.json();
        toast.success('已套用標準清單', `新增 ${j.created} 項`);
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '失敗' }));
        toast.error('套用失敗', j.error);
      }
    } catch {
      toast.error('套用失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function addItem() {
    if (title.trim().length < 2) { toast.error('請輸入需求名稱'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/prep`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: desc.trim() || undefined }),
      });
      if (res.ok) {
        toast.success('已新增需求項');
        setTitle(''); setDesc(''); setAddOpen(false);
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '失敗' }));
        toast.error('新增失敗', j.error);
      }
    } catch {
      toast.error('新增失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(reqId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/prep-requirements/${reqId}`, { method: 'DELETE' });
      if (res.ok) { toast.success('已刪除需求項'); router.refresh(); }
      else {
        const j = await res.json().catch(() => ({ error: '失敗' }));
        toast.error('刪除失敗', j.error);
      }
    } catch {
      toast.error('刪除失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function upload(sub: Sub, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const tooBig = files.filter((f) => f.size > 20 * 1024 * 1024);
    if (tooBig.length > 0) {
      toast.error('檔案超過 20MB 上限', tooBig.map((f) => f.name).join('、'));
      e.target.value = '';
      return;
    }
    setBusyItemId(sub.id);
    try {
      let ok = 0;
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('targetType', 'PREP_SUBMISSION');
        fd.append('targetId', sub.id);
        const res = await fetch('/api/evidences', { method: 'POST', body: fd });
        if (res.ok) ok += 1;
        else {
          const j = await res.json().catch(() => ({ error: '上傳失敗' }));
          toast.error(`「${f.name}」上傳失敗`, j.error);
        }
      }
      if (ok > 0) {
        // 重算狀態(EMPTY→待繳交;清退回註記),失敗要讓使用者知道
        const r2 = await fetch(`/api/prep-submissions/${sub.id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (r2.ok) {
          toast.success('已上傳', files.length > 1 ? `共 ${ok}/${files.length} 個檔案` : files[0].name);
        } else {
          toast.error('檔案已上傳,但狀態更新失敗', '請重新整理頁面;若狀態仍未變,請再上傳一次或聯繫中心');
        }
        router.refresh();
      }
    } catch {
      toast.error('上傳失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusyItemId(null);
      e.target.value = '';
    }
  }

  async function saveReason(subId: string, text: string) {
    setBusyItemId(subId);
    try {
      const res = await fetch(`/api/prep-submissions/${subId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ noFileReason: text }),
      });
      if (res.ok) {
        toast.success(text.trim() ? '已儲存無檔說明' : '已清除說明');
        setReasonFor(null); setReasonText('');
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '儲存失敗' }));
        toast.error('儲存失敗', j.error);
      }
    } catch {
      toast.error('儲存失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusyItemId(null);
    }
  }

  async function submitAll() {
    setBusy(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/prep/submit`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('已確定繳交', `${j.submitted} 項已送交中心審核`);
        setSubmitOpen(false);
        router.refresh();
      } else {
        toast.error('繳交失敗', j.error);
      }
    } catch {
      toast.error('繳交失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function doRemoveFile(id: string, name: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/evidences/${id}`, { method: 'DELETE' });
      setPendingFile(null);
      if (res.ok) {
        toast.success('已刪除檔案', name);
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '刪除失敗' }));
        toast.error('刪除失敗', j.error);
      }
    } catch {
      toast.error('刪除失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function review(subId: string, status: 'CONFIRMED' | 'INSUFFICIENT', note?: string) {
    setBusyItemId(subId);
    try {
      const res = await fetch(`/api/prep-submissions/${subId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, reviewNote: note }),
      });
      if (res.ok) {
        toast.success(status === 'CONFIRMED' ? '已確認齊備' : '已退回補正');
        setReturnOpen(null); setReturnNote('');
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '失敗' }));
        toast.error('操作失敗', j.error);
      }
    } catch {
      toast.error('操作失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => setAddOpen(true)} leadingIcon={<Plus size={15} />}>
            新增需求項
          </Button>
          <Button size="sm" variant="tonal" onClick={applyStandard} loading={busy}>
            套用標準清單
          </Button>
        </div>
      )}

      {/* 機關:確定繳交 */}
      {isOrg && cycleStatus === 'PREPARATION' && initialItems.length > 0 && (
        <Card padded={false} variant="filled">
          <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-title text-on-surface">確定繳交</p>
              <p className="mt-0.5 text-body-sm text-on-surface-variant leading-relaxed">
                {requiredUnaddressed.length > 0
                  ? `尚有 ${requiredUnaddressed.length} 項必填未處理(請上傳檔案或敘明無相關文件理由)`
                  : draftCount > 0
                  ? `${draftCount} 項待繳交。確定繳交後文件即鎖定送交中心審核,需中心退回才能再修改。`
                  : '已全部繳交,等待中心審核。'}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setSubmitOpen(true)}
              disabled={!canSubmit || busy || busyItemId !== null}
              leadingIcon={<Check size={15} />}
            >
              確定繳交{draftCount > 0 ? `(${draftCount})` : ''}
            </Button>
          </div>
        </Card>
      )}

      {initialItems.length === 0 ? (
        <Card variant="outlined" padded={false}>
          <div className="p-6">
            <EmptyState
              icon={<FileText size={28} />}
              title="尚未設定資料準備需求"
              description={isAdmin ? '點「套用標準清單」快速建立,或逐項新增。' : '等最高管理員設定需求清單後,這裡會顯示待上傳項目。'}
            />
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {initialItems.map((item, idx) => {
            const sub = item.submission;
            const files = filesOf(sub?.id);
            const rawStatus = (sub?.status ?? 'EMPTY') as PrepStatus;
            // 有檔案/有理由卻仍 EMPTY(舊資料或上傳後狀態漏更新)→ 視為「待繳交」
            const addressedByContent = files.length > 0 || !!sub?.noFileReason?.trim();
            const status = rawStatus === 'EMPTY' && addressedByContent ? 'UPLOADED' : rawStatus;
            const orgItemEditable = orgCanEdit && prepOrgEditable(status);
            return (
              <Card key={item.id} padded={false} variant={status === 'CONFIRMED' ? 'filled' : 'elevated'}>
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <span
                      className={`w-8 h-8 rounded-md flex items-center justify-center text-body-sm font-medium tabular-nums shrink-0 ${
                        status === 'CONFIRMED'
                          ? 'bg-success-50 text-success-700'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {status === 'CONFIRMED' ? <Check size={16} /> : idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-title text-on-surface">{item.title}</p>
                        {!item.required && <Chip tone="neutral" size="sm">選附</Chip>}
                        <Chip tone={statusTone(status)} size="sm" dot>
                          {PREP_STATUS_LABELS[status]}
                        </Chip>
                      </div>
                      {item.description && (
                        <p className="mt-1.5 text-body-sm text-on-surface-variant leading-relaxed">{item.description}</p>
                      )}

                      {/* 退回說明 */}
                      {status === 'INSUFFICIENT' && sub?.reviewNote && (
                        <div className="mt-2 flex items-start gap-2 rounded-sm bg-danger-50 text-danger-700 px-3 py-2 text-body-sm">
                          <AlertCircle size={16} className="mt-0.5 shrink-0" />
                          <span>退回說明:{sub.reviewNote}(請補正後重新繳交)</span>
                        </div>
                      )}

                      {/* 已繳交鎖定提示 */}
                      {status === 'SUBMITTED' && (
                        <p className="mt-2 text-caption text-on-surface-variant">
                          已繳交{sub?.submittedAt ? `(${fmtROCDateTime(sub.submittedAt)})` : ''},等待中心審核;如需修改請洽中心退回。
                        </p>
                      )}

                      {/* 無相關文件理由:編輯中 / 已填顯示 */}
                      {sub && reasonFor === sub.id ? (
                        <div className="mt-3 flex flex-col gap-2">
                          <Textarea
                            label="無相關文件說明"
                            value={reasonText}
                            onChange={(e) => setReasonText(e.target.value)}
                            rows={2}
                            placeholder="例:本機關無委外服務,故無委外管理相關文件…"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" loading={busyItemId === sub.id} onClick={() => saveReason(sub.id, reasonText)}>儲存說明</Button>
                            <Button size="sm" variant="text" onClick={() => { setReasonFor(null); setReasonText(''); }}>取消</Button>
                          </div>
                        </div>
                      ) : sub?.noFileReason ? (
                        <div className="mt-2 flex items-start gap-2 rounded-sm bg-surface-container text-on-surface-variant px-3 py-2 text-body-sm">
                          <FileText size={16} className="mt-0.5 shrink-0" />
                          <span className="flex-1">無相關文件說明:{sub.noFileReason}</span>
                          {orgItemEditable && (
                            <button
                              type="button"
                              onClick={() => { setReasonFor(sub.id); setReasonText(sub.noFileReason ?? ''); }}
                              className="text-caption text-primary-700 hover:underline shrink-0 focus-ring rounded-sm px-1"
                            >
                              修改
                            </button>
                          )}
                        </div>
                      ) : null}

                      {/* 檔案列表 */}
                      {files.length > 0 && (
                        <ul className="mt-3 space-y-1">
                          {files.map((f) => (
                            <li key={f.id} className="flex items-center gap-2">
                              <a
                                className="inline-flex items-center gap-1.5 text-body-sm text-primary-700 hover:underline"
                                href={`/api/evidences/${f.id}/download?inline=1`}
                                target="_blank"
                                rel="noopener"
                              >
                                <Paperclip size={14} />
                                {f.originalName}
                                <span className="text-caption text-on-surface-variant">
                                  ({Math.round(f.sizeBytes / 1024)} KB)
                                </span>
                              </a>
                              {orgItemEditable && (
                                <button
                                  type="button"
                                  onClick={() => setPendingFile({ id: f.id, name: f.originalName })}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-full text-on-surface-variant hover:text-danger-600 hover:bg-danger-50 transition-colors focus-ring"
                                  aria-label={`刪除檔案 ${f.originalName}`}
                                  title="刪除這個檔案"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* 動作列 */}
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {/* 機關:可編輯狀態才有上傳 / 敘述理由 */}
                        {orgItemEditable && sub && (
                          <>
                            <FileUploadButton
                              size="sm"
                              label="上傳檔案(可多選)"
                              busy={busyItemId === sub.id}
                              onChange={(e) => upload(sub, e)}
                              multiple
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.png,.jpg,.jpeg,.gif,.webp,.zip"
                            />
                            {!sub.noFileReason && reasonFor !== sub.id && (
                              <Button size="sm" variant="text" onClick={() => { setReasonFor(sub.id); setReasonText(''); }}>
                                無相關文件,敘述理由
                              </Button>
                            )}
                            <span className="text-caption text-on-surface-variant">單檔 ≤ 20MB;PDF / 圖片上傳後會自動加機關浮水印</span>
                          </>
                        )}

                        {/* 中心:僅資料準備階段可審核「已繳交」/「已確認」 */}
                        {adminCanReview && sub && status === 'SUBMITTED' && (
                          <>
                            <Button size="sm" variant="tonal" leadingIcon={<Check size={14} />} onClick={() => review(sub.id, 'CONFIRMED')} loading={busyItemId === sub.id}>
                              確認齊備
                            </Button>
                            <Button size="sm" variant="text" onClick={() => { setReturnOpen(sub.id); setReturnNote(''); }}>
                              退回補正
                            </Button>
                          </>
                        )}
                        {adminCanReview && sub && status === 'CONFIRMED' && (
                          <Button size="sm" variant="text" onClick={() => { setReturnOpen(sub.id); setReturnNote(''); }}>
                            退回重審
                          </Button>
                        )}
                        {adminCanReview && sub && (status === 'EMPTY' || status === 'UPLOADED' || status === 'INSUFFICIENT') && (
                          <span className="text-caption text-on-surface-variant">
                            {status === 'INSUFFICIENT'
                              ? '已退回,待機關補正後重新繳交'
                              : status === 'UPLOADED'
                              ? '機關編輯中,尚未確定繳交'
                              : '機關尚未上傳或敘明'}
                          </span>
                        )}

                        {/* 中心:無檔案且無理由的需求項可刪除 */}
                        {isAdmin && files.length === 0 && !sub?.noFileReason && (
                          <Button size="sm" variant="text" onClick={() => setDeletingItem({ id: item.id, title: item.title })} disabled={busy}>
                            刪除
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 新增需求 dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(v) => !busy && setAddOpen(v)}
        title="新增資料需求項"
        description="設定受稽機關於實地稽核前需上傳之文件。"
        footer={
          <>
            <Button variant="text" onClick={() => setAddOpen(false)} disabled={busy}>取消</Button>
            <Button onClick={addItem} loading={busy}>新增</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <TextField label="需求名稱" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例:資通安全維護計畫" />
          <Textarea label="說明(選填)" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="例:最新核定版本" />
        </div>
      </Dialog>

      {/* 中心退回 dialog */}
      <ConfirmDialog
        open={returnOpen !== null}
        onOpenChange={(o) => !busy && !o && setReturnOpen(null)}
        title="退回補正"
        description={
          <div className="mt-2">
            <Textarea
              label="退回說明(必填)"
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              rows={3}
              placeholder="例:缺 ISMS 證書附件,請補上傳含 TAF 標誌之版本…"
            />
          </div>
        }
        confirmLabel="退回補正"
        tone="danger"
        onConfirm={() => {
          if (!returnNote.trim()) { toast.error('請填寫退回說明'); return; }
          if (returnOpen) review(returnOpen, 'INSUFFICIENT', returnNote.trim());
        }}
        loading={busyItemId !== null}
      />

      {/* 確定繳交確認 */}
      <ConfirmDialog
        open={submitOpen}
        onOpenChange={(o) => !busy && !o && setSubmitOpen(false)}
        title="確定繳交稽核前資料"
        description={`將把 ${draftCount} 項資料送交中心審核。繳交後該些項目的檔案會鎖定,無法再撤回或刪改,需中心退回才能修改。確定繳交?`}
        confirmLabel="確定繳交"
        onConfirm={submitAll}
        loading={busy}
      />

      {/* 刪除檔案確認 */}
      <ConfirmDialog
        open={pendingFile !== null}
        onOpenChange={(o) => !busy && !o && setPendingFile(null)}
        title="刪除檔案"
        description={pendingFile ? `確定刪除「${pendingFile.name}」?刪除後無法復原。` : undefined}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={() => { if (pendingFile) doRemoveFile(pendingFile.id, pendingFile.name); }}
        loading={busy}
      />

      {/* 刪除需求項確認 */}
      <ConfirmDialog
        open={deletingItem !== null}
        onOpenChange={(o) => !busy && !o && setDeletingItem(null)}
        title="刪除需求項"
        description={deletingItem ? `確定刪除需求項「${deletingItem.title}」?此操作無法復原。` : undefined}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={() => { if (deletingItem) { removeItem(deletingItem.id); setDeletingItem(null); } }}
        loading={busy}
      />
    </div>
  );
}
