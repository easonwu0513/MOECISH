'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { Pencil, Plus } from '@/components/icons';

type ItemData = {
  id: string;
  itemNo: string;
  content: string;
  auditBasis: string | null;
  auditFocus: string | null;
  expectedEvidence: string | null;
  responseCount: number;
};

/** 單一檢核項目:編輯(題文+法規對照)/ 刪除。 */
export function ItemActions({ item }: { item: ItemData }) {
  const router = useRouter();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [content, setContent] = useState(item.content);
  const [auditBasis, setAuditBasis] = useState(item.auditBasis ?? '');
  const [auditFocus, setAuditFocus] = useState(item.auditFocus ?? '');
  const [expectedEvidence, setExpectedEvidence] = useState(item.expectedEvidence ?? '');

  async function save() {
    if (content.trim().length < 5) { toast.error('題目內容太短'); return; }
    setBusy(true);
    const res = await fetch(`/api/admin/checklist-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: content.trim(),
        auditBasis: auditBasis.trim() || null,
        auditFocus: auditFocus.trim() || null,
        expectedEvidence: expectedEvidence.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return;
    }
    toast.success('已更新項目', item.itemNo);
    setEditOpen(false);
    router.refresh();
  }

  async function doDelete() {
    setBusy(true);
    const res = await fetch(`/api/admin/checklist-items/${item.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '刪除失敗' }));
      toast.error('刪除失敗', j.error);
      return;
    }
    toast.success('已刪除項目', item.itemNo);
    setDelOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="text" leadingIcon={<Pencil size={13} />} onClick={() => setEditOpen(true)}>
          編輯
        </Button>
        {item.responseCount === 0 && (
          <Button size="sm" variant="text" className="text-danger-600" onClick={() => setDelOpen(true)}>
            刪除
          </Button>
        )}
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={(v) => !busy && setEditOpen(v)}
        size="lg"
        title={`編輯項次 ${item.itemNo}`}
        description={item.responseCount > 0 ? `已有 ${item.responseCount} 筆機關作答;修改視為勘誤,會記入稽核軌跡。` : '題文與法規對照皆可修改。'}
        footer={
          <>
            <Button variant="text" onClick={() => setEditOpen(false)} disabled={busy}>取消</Button>
            <Button onClick={save} loading={busy}>儲存</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2 max-h-[72vh] overflow-y-auto pr-1">
          <Textarea label="檢核項目(題文)" value={content} onChange={(e) => setContent(e.target.value)} rows={7} />
          <Textarea
            label="稽核依據(法規條文;「一、法規名稱」起頭、「1. 條文」逐條)"
            value={auditBasis}
            onChange={(e) => setAuditBasis(e.target.value)}
            rows={14}
            placeholder={'一、資通安全管理法施行細則\n1. 第九條第一項…'}
          />
          <Textarea
            label="稽核重點(每行一點)"
            value={auditFocus}
            onChange={(e) => setAuditFocus(e.target.value)}
            rows={7}
            placeholder={'1. 應界定核心業務…\n2. …'}
          />
          <Textarea
            label="應備文件(每行一項)"
            value={expectedEvidence}
            onChange={(e) => setExpectedEvidence(e.target.value)}
            rows={5}
            placeholder={'1. 核心業務盤點文件。\n2. …'}
          />
        </div>
      </Dialog>

      <ConfirmDialog
        open={delOpen}
        onOpenChange={(o) => !busy && !o && setDelOpen(false)}
        title="刪除檢核項目"
        description={`確定刪除項次 ${item.itemNo}?無法復原。`}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={doDelete}
        loading={busy}
      />
    </>
  );
}

/** 新增檢核項目。 */
export function AddItemButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [itemNo, setItemNo] = useState('');
  const [content, setContent] = useState('');

  async function create() {
    if (!/^\d+\.\d+$/.test(itemNo.trim())) { toast.error('項次格式須為「構面.序號」,例 4.6'); return; }
    if (content.trim().length < 5) { toast.error('題目內容太短'); return; }
    setBusy(true);
    const res = await fetch(`/api/admin/checklist-versions/${versionId}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemNo: itemNo.trim(), content: content.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '新增失敗' }));
      toast.error('新增失敗', j.error);
      return;
    }
    toast.success('已新增項目', itemNo);
    setOpen(false);
    setItemNo(''); setContent('');
    router.refresh();
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} leadingIcon={<Plus size={15} />}>
        新增項目
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => !busy && setOpen(v)}
        title="新增檢核項目"
        description="構面依項次主號(1-9)自動歸屬;法規對照可於新增後再編輯補上。"
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={busy}>取消</Button>
            <Button onClick={create} loading={busy}>新增</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <TextField label="項次(例 4.6)" value={itemNo} onChange={(e) => setItemNo(e.target.value)} placeholder="4.6" />
          <Textarea label="檢核項目(題文)" value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
        </div>
      </Dialog>
    </>
  );
}
