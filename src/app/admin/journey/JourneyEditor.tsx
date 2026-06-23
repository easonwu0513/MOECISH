'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { Plus, CheckCircle } from '@/components/icons';
import { ROLE_LABELS, JOURNEY_SCOPE_LABELS, type Role, type JourneyScope } from '@/lib/types';

type EItem = { id: string; title: string; hint: string | null; role: Role | null };
type EStage = { id: string; stageKey: string; title: string; summary: string | null; items: EItem[] };
type EData = { CYCLE: EStage[]; PROGRAMME: EStage[] };

const ROLE_OPTS = [
  { value: '', label: '全體' },
  { value: 'SUPER_ADMIN', label: '中心' },
  { value: 'ORG_ADMIN', label: '機關' },
  { value: 'AUDITOR', label: '委員' },
];

export default function JourneyEditor({ data }: { data: EData }) {
  const router = useRouter();
  const toast = useToast();
  const [scope, setScope] = useState<JourneyScope>('PROGRAMME');
  const [busy, setBusy] = useState(false);

  // 階段對話框
  const [stageOpen, setStageOpen] = useState(false);
  const [stageEditing, setStageEditing] = useState<EStage | null>(null);
  const [stageForm, setStageForm] = useState({ stageKey: '', title: '', summary: '' });
  const [stageDeleting, setStageDeleting] = useState<EStage | null>(null);

  // 項目對話框
  const [itemOpen, setItemOpen] = useState(false);
  const [itemEditing, setItemEditing] = useState<EItem | null>(null);
  const [itemStageId, setItemStageId] = useState('');
  const [itemForm, setItemForm] = useState({ title: '', hint: '', role: '' });
  const [itemDeleting, setItemDeleting] = useState<EItem | null>(null);

  const stages = data[scope];

  // ── 階段 ──
  function openAddStage() {
    setStageEditing(null);
    setStageForm({ stageKey: '', title: '', summary: '' });
    setStageOpen(true);
  }
  function openEditStage(s: EStage) {
    setStageEditing(s);
    setStageForm({ stageKey: s.stageKey, title: s.title, summary: s.summary ?? '' });
    setStageOpen(true);
  }
  async function submitStage() {
    if (stageForm.title.trim().length < 1) { toast.error('請輸入階段名稱'); return; }
    if (!stageEditing && stageForm.stageKey.trim().length < 1) { toast.error('請輸入階段代碼'); return; }
    setBusy(true);
    const url = stageEditing ? `/api/admin/journey/stages/${stageEditing.id}` : '/api/admin/journey/stages';
    const res = await fetch(url, {
      method: stageEditing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        stageEditing
          ? { title: stageForm.title.trim(), summary: stageForm.summary.trim() || null, stageKey: stageForm.stageKey.trim() }
          : { scope, stageKey: stageForm.stageKey.trim(), title: stageForm.title.trim(), summary: stageForm.summary.trim() || null },
      ),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error('儲存失敗', j.error); return; }
    toast.success(stageEditing ? '已更新' : '已新增階段');
    setStageOpen(false);
    router.refresh();
  }
  async function removeStage(s: EStage) {
    setBusy(true);
    const res = await fetch(`/api/admin/journey/stages/${s.id}`, { method: 'DELETE' });
    setBusy(false);
    setStageDeleting(null);
    if (!res.ok) { toast.error('刪除失敗'); return; }
    toast.success('已刪除階段');
    router.refresh();
  }

  // ── 項目 ──
  function openAddItem(stageId: string) {
    setItemEditing(null);
    setItemStageId(stageId);
    setItemForm({ title: '', hint: '', role: '' });
    setItemOpen(true);
  }
  function openEditItem(stageId: string, it: EItem) {
    setItemEditing(it);
    setItemStageId(stageId);
    setItemForm({ title: it.title, hint: it.hint ?? '', role: it.role ?? '' });
    setItemOpen(true);
  }
  async function submitItem() {
    if (itemForm.title.trim().length < 1) { toast.error('請輸入項目內容'); return; }
    setBusy(true);
    const roleVal = scope === 'CYCLE' ? itemForm.role || null : null;
    const url = itemEditing ? `/api/admin/journey/items/${itemEditing.id}` : '/api/admin/journey/items';
    const res = await fetch(url, {
      method: itemEditing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        itemEditing
          ? { title: itemForm.title.trim(), hint: itemForm.hint.trim() || null, role: roleVal }
          : { stageId: itemStageId, title: itemForm.title.trim(), hint: itemForm.hint.trim() || null, role: roleVal },
      ),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error('儲存失敗', j.error); return; }
    toast.success(itemEditing ? '已更新' : '已新增項目');
    setItemOpen(false);
    router.refresh();
  }
  async function removeItem(it: EItem) {
    setBusy(true);
    const res = await fetch(`/api/admin/journey/items/${it.id}`, { method: 'DELETE' });
    setBusy(false);
    setItemDeleting(null);
    if (!res.ok) { toast.error('刪除失敗'); return; }
    toast.success('已刪除項目');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Segmented
          value={scope}
          onChange={(v) => setScope(v as JourneyScope)}
          options={[
            { value: 'PROGRAMME', label: JOURNEY_SCOPE_LABELS.PROGRAMME },
            { value: 'CYCLE', label: JOURNEY_SCOPE_LABELS.CYCLE },
          ]}
        />
        <Button size="sm" leadingIcon={<Plus size={15} />} onClick={openAddStage}>新增階段</Button>
      </div>

      {stages.length === 0 ? (
        <Card variant="outlined">
          <EmptyState icon={<CheckCircle size={28} />} title="此精靈尚無階段" description="新增階段後即可在其下新增逐項任務。" />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {stages.map((s) => (
            <Card key={s.id} padded={false} variant="elevated">
              <div className="p-4 border-b border-outline-variant/50 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-title-md text-on-surface">{s.title}</p>
                    <Chip tone="neutral" size="sm">{s.stageKey}</Chip>
                    <Chip tone="neutral" size="sm">{s.items.length} 項</Chip>
                  </div>
                  {s.summary && <p className="mt-1 text-caption text-on-surface-variant">{s.summary}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => openEditStage(s)}>編輯</Button>
                  <Button size="sm" variant="text" onClick={() => setStageDeleting(s)}>刪除</Button>
                </div>
              </div>
              {s.items.length > 0 && (
                <ul className="divide-y divide-outline-variant/40">
                  {s.items.map((it) => (
                    <li key={it.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-body-sm text-on-surface">{it.title}</span>
                          {scope === 'CYCLE' && (
                            <Chip tone="neutral" size="sm">{it.role ? ROLE_LABELS[it.role] : '全體'}</Chip>
                          )}
                        </div>
                        {it.hint && <p className="mt-0.5 text-caption text-on-surface-variant">{it.hint}</p>}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => openEditItem(s.id, it)}>編輯</Button>
                        <Button size="sm" variant="text" onClick={() => setItemDeleting(it)}>刪除</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="p-3 border-t border-outline-variant/40">
                <Button size="sm" variant="text" leadingIcon={<Plus size={14} />} onClick={() => openAddItem(s.id)}>新增項目</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 階段 Dialog */}
      <Dialog
        open={stageOpen}
        onOpenChange={(v) => !busy && setStageOpen(v)}
        title={stageEditing ? '編輯階段' : '新增階段'}
        footer={
          <>
            <Button variant="text" onClick={() => setStageOpen(false)} disabled={busy}>取消</Button>
            <Button onClick={submitStage} loading={busy}>{stageEditing ? '儲存' : '新增'}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <TextField label="階段名稱" value={stageForm.title} onChange={(e) => setStageForm((f) => ({ ...f, title: e.target.value }))} placeholder="例:委員共識會議" />
          <TextField label="階段代碼" value={stageForm.stageKey} onChange={(e) => setStageForm((f) => ({ ...f, stageKey: e.target.value }))} placeholder={scope === 'CYCLE' ? '週期狀態,如 ONSITE' : '如 P2_CONSENSUS'} />
          {scope === 'CYCLE' && (
            <p className="-mt-2 text-caption text-on-surface-variant leading-relaxed">
              週期精靈請填對應週期狀態(DRAFT / PREPARATION / READY / ONSITE / REPORT_ISSUED / REMEDIATION / CLOSED),才能在週期頁自動展開目前階段。
            </p>
          )}
          <Textarea label="階段說明(選填)" value={stageForm.summary} onChange={(e) => setStageForm((f) => ({ ...f, summary: e.target.value }))} rows={2} />
        </div>
      </Dialog>

      {/* 項目 Dialog */}
      <Dialog
        open={itemOpen}
        onOpenChange={(v) => !busy && setItemOpen(v)}
        title={itemEditing ? '編輯項目' : '新增項目'}
        footer={
          <>
            <Button variant="text" onClick={() => setItemOpen(false)} disabled={busy}>取消</Button>
            <Button onClick={submitItem} loading={busy}>{itemEditing ? '儲存' : '新增'}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <TextField label="項目內容" value={itemForm.title} onChange={(e) => setItemForm((f) => ({ ...f, title: e.target.value }))} placeholder="例:寄送委員邀請函" />
          <Textarea label="提示 / 文件位置(選填)" value={itemForm.hint} onChange={(e) => setItemForm((f) => ({ ...f, hint: e.target.value }))} rows={2} />
          {scope === 'CYCLE' && (
            <div>
              <p className="text-caption font-medium text-on-surface-variant mb-1.5">負責角色</p>
              <Segmented value={itemForm.role} onChange={(v) => setItemForm((f) => ({ ...f, role: v }))} options={ROLE_OPTS} />
            </div>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={stageDeleting !== null}
        onOpenChange={(o) => !busy && !o && setStageDeleting(null)}
        title="刪除階段"
        description={stageDeleting ? `確定刪除階段「${stageDeleting.title}」?其下所有項目與已勾選進度將一併刪除。` : undefined}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={() => { if (stageDeleting) removeStage(stageDeleting); }}
        loading={busy}
      />
      <ConfirmDialog
        open={itemDeleting !== null}
        onOpenChange={(o) => !busy && !o && setItemDeleting(null)}
        title="刪除項目"
        description={itemDeleting ? `確定刪除「${itemDeleting.title}」?已勾選進度將一併刪除。` : undefined}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={() => { if (itemDeleting) removeItem(itemDeleting); }}
        loading={busy}
      />
    </div>
  );
}
