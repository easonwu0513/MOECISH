'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Pencil } from '@/components/icons';
import {
  DEFICIENCY_ASPECTS,
  DEFICIENCY_TYPES,
  DEFICIENCY_ASPECT_LABELS,
  DEFICIENCY_TYPE_LABELS,
  type DeficiencyAspect,
  type DeficiencyType,
} from '@/lib/types';

/**
 * SUPER_ADMIN 缺失編輯/刪除(僅機關尚未開始填報時)。
 * 接既有 PATCH/DELETE /api/deficiencies/[id](伺服器端有同樣防呆)。
 */
export default function AdminDefActions({
  deficiencyId,
  cycleId,
  initial,
}: {
  deficiencyId: string;
  cycleId: string;
  initial: { aspect: DeficiencyAspect; type: DeficiencyType; description: string; checklistRef: string | null };
}) {
  const router = useRouter();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [aspect, setAspect] = useState<DeficiencyAspect>(initial.aspect);
  const [type, setType] = useState<DeficiencyType>(initial.type);
  const [description, setDescription] = useState(initial.description);
  const [checklistRef, setChecklistRef] = useState(initial.checklistRef ?? '');

  async function saveEdit() {
    if (description.trim().length < 10) {
      toast.error('缺失描述太短', '至少 10 個字');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/deficiencies/${deficiencyId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        aspect,
        type,
        description: description.trim(),
        checklistRef: checklistRef.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return;
    }
    toast.success('缺失內容已更新');
    setEditOpen(false);
    router.refresh();
  }

  async function doDelete() {
    setSaving(true);
    const res = await fetch(`/api/deficiencies/${deficiencyId}`, { method: 'DELETE' });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '刪除失敗' }));
      toast.error('刪除失敗', j.error);
      return;
    }
    toast.success('已刪除缺失');
    setDelOpen(false);
    router.push(`/cycles/${cycleId}/deficiencies`);
    router.refresh();
  }

  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" variant="tonal" leadingIcon={<Pencil size={14} />} onClick={() => setEditOpen(true)}>
          編輯缺失
        </Button>
        <Button size="sm" variant="text" className="text-danger-600" onClick={() => setDelOpen(true)}>
          刪除
        </Button>
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={(v) => !saving && setEditOpen(v)}
        title="編輯缺失內容"
        description="機關開始填報後將鎖定,屆時不可再修改。"
        footer={
          <>
            <Button variant="text" onClick={() => setEditOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={saveEdit} loading={saving}>儲存</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <Select label="構面" value={aspect} onChange={(e) => setAspect(e.target.value as DeficiencyAspect)}>
              {DEFICIENCY_ASPECTS.map((a) => (
                <option key={a} value={a}>{DEFICIENCY_ASPECT_LABELS[a]}</option>
              ))}
            </Select>
            <Select label="類型" value={type} onChange={(e) => setType(e.target.value as DeficiencyType)}>
              {DEFICIENCY_TYPES.map((t) => (
                <option key={t} value={t}>{DEFICIENCY_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </div>
          <Textarea
            label="缺失描述"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
          />
          <TextField
            label="對應檢核項(選填)"
            value={checklistRef}
            onChange={(e) => setChecklistRef(e.target.value)}
            placeholder="例:4.2"
          />
        </div>
      </Dialog>

      <ConfirmDialog
        open={delOpen}
        onOpenChange={(o) => !saving && !o && setDelOpen(false)}
        title="刪除缺失"
        description="將一併刪除其矯正措施紀錄,且無法復原。確定刪除這項缺失?"
        confirmLabel="刪除"
        tone="danger"
        onConfirm={doDelete}
        loading={saving}
      />
    </>
  );
}
