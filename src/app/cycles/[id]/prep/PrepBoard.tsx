'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { Plus, Paperclip, Check, AlertCircle, FileText, X } from '@/components/icons';
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { PREP_STATUS_LABELS, type PrepStatus } from '@/lib/types';

type Sub = { id: string; status: string; note: string | null; reviewNote: string | null };
type Item = {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  submission: Sub | null;
};
type FileRec = { id: string; targetId: string; originalName: string; sizeBytes: number };

function statusTone(s: PrepStatus): 'neutral' | 'primary' | 'success' | 'danger' {
  switch (s) {
    case 'EMPTY': return 'neutral';
    case 'UPLOADED': return 'primary';
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

  // AUDITOR 缺件 dialog
  const [insufOpen, setInsufOpen] = useState<string | null>(null); // submissionId
  const [insufNote, setInsufNote] = useState('');

  const isAdmin = role === 'SUPER_ADMIN';
  const isOrg = role === 'ORG_ADMIN';
  const isAuditor = role === 'AUDITOR';
  const orgCanEdit = isOrg && (cycleStatus === 'PREPARATION' || cycleStatus === 'DRAFT');

  const filesOf = (subId?: string) =>
    subId ? initialFiles.filter((f) => f.targetId === subId) : [];

  async function applyStandard() {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/prep?standard=1`, { method: 'POST' });
    setBusy(false);
    if (res.ok) {
      const j = await res.json();
      toast.success('已套用標準清單', `新增 ${j.created} 項`);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '失敗' }));
      toast.error('套用失敗', j.error);
    }
  }

  async function addItem() {
    if (title.trim().length < 2) { toast.error('請輸入需求名稱'); return; }
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/prep`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), description: desc.trim() || undefined }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success('已新增需求項');
      setTitle(''); setDesc(''); setAddOpen(false);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '失敗' }));
      toast.error('新增失敗', j.error);
    }
  }

  async function removeItem(reqId: string) {
    setBusy(true);
    const res = await fetch(`/api/prep-requirements/${reqId}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) { toast.success('已刪除需求項'); router.refresh(); }
    else {
      const j = await res.json().catch(() => ({ error: '失敗' }));
      toast.error('刪除失敗', j.error);
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
      // 重算狀態(EMPTY→UPLOADED;清缺件註記),失敗要讓使用者知道,否則委員端看不到待確認
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
    setBusyItemId(null);
    e.target.value = '';
  }

  async function removeFile(id: string, name: string) {
    if (!window.confirm(`確定刪除「${name}」?刪除後無法復原。`)) return;
    const res = await fetch(`/api/evidences/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('已刪除檔案', name);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '刪除失敗' }));
      toast.error('刪除失敗', j.error);
    }
  }

  async function review(subId: string, status: 'CONFIRMED' | 'INSUFFICIENT', note?: string) {
    setBusyItemId(subId);
    const res = await fetch(`/api/prep-submissions/${subId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, reviewNote: note }),
    });
    setBusyItemId(null);
    if (res.ok) {
      toast.success(status === 'CONFIRMED' ? '已確認' : '已標記缺件');
      setInsufOpen(null); setInsufNote('');
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '失敗' }));
      toast.error('操作失敗', j.error);
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
            const status = (sub?.status ?? 'EMPTY') as PrepStatus;
            const files = filesOf(sub?.id);
            return (
              <Card key={item.id} padded={false}>
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <span className="w-8 h-8 rounded-md bg-surface-container flex items-center justify-center text-body-sm font-medium text-on-surface-variant tabular-nums shrink-0">
                      {idx + 1}
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
                        <p className="mt-1 text-body-sm text-on-surface-variant">{item.description}</p>
                      )}

                      {/* 缺件理由 */}
                      {status === 'INSUFFICIENT' && sub?.reviewNote && (
                        <div className="mt-2 flex items-start gap-2 rounded-sm bg-danger-50 text-danger-700 px-3 py-2 text-body-sm">
                          <AlertCircle size={16} className="mt-0.5 shrink-0" />
                          <span>委員意見:{sub.reviewNote}</span>
                        </div>
                      )}

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
                              {orgCanEdit && status !== 'CONFIRMED' && (
                                <button
                                  type="button"
                                  onClick={() => removeFile(f.id, f.originalName)}
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
                        {orgCanEdit && sub && status !== 'CONFIRMED' && (
                          <>
                            <FileUploadButton
                              size="sm"
                              label="上傳檔案(可多選)"
                              busy={busyItemId === sub.id}
                              onChange={(e) => upload(sub, e)}
                              multiple
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.png,.jpg,.jpeg,.gif,.webp,.zip"
                            />
                            <span className="text-caption text-on-surface-variant">單檔 ≤ 20MB</span>
                          </>
                        )}
                        {isAuditor && sub && status === 'UPLOADED' && (
                          <>
                            <Button size="sm" variant="tonal" leadingIcon={<Check size={14} />} onClick={() => review(sub.id, 'CONFIRMED')} loading={busyItemId === sub.id}>
                              確認齊備
                            </Button>
                            <Button size="sm" variant="text" onClick={() => { setInsufOpen(sub.id); setInsufNote(''); }}>
                              標記缺件
                            </Button>
                          </>
                        )}
                        {isAuditor && sub && status === 'INSUFFICIENT' && (
                          <Button size="sm" variant="tonal" leadingIcon={<Check size={14} />} onClick={() => review(sub.id, 'CONFIRMED')} loading={busyItemId === sub.id}>
                            補件後確認
                          </Button>
                        )}
                        {isAdmin && files.length === 0 && (
                          <Button size="sm" variant="text" onClick={() => removeItem(item.id)} disabled={busy}>
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

      {/* 缺件 dialog */}
      <ConfirmDialog
        open={insufOpen !== null}
        onOpenChange={(o) => !busy && !o && setInsufOpen(null)}
        title="標記缺件"
        description={
          <div className="mt-2">
            <Textarea
              label="缺件說明(必填)"
              value={insufNote}
              onChange={(e) => setInsufNote(e.target.value)}
              rows={3}
              placeholder="例:缺 ISMS 證書附件,請補上傳含 TAF 標誌之版本…"
            />
          </div>
        }
        confirmLabel="標記缺件"
        tone="danger"
        onConfirm={() => {
          if (!insufNote.trim()) { toast.error('請填寫缺件說明'); return; }
          if (insufOpen) review(insufOpen, 'INSUFFICIENT', insufNote.trim());
        }}
        loading={busyItemId !== null}
      />
    </div>
  );
}
