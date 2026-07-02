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
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { Plus, CheckCircle } from '@/components/icons';
import { ROLE_LABELS, JOURNEY_SCOPE_LABELS, type Role, type JourneyScope } from '@/lib/types';
import { AUTO_KEY_OPTIONS, HREF_OPTIONS } from '@/lib/journey-auto';

type EItem = {
  id: string; title: string; hint: string | null; role: Role | null;
  autoKey: string | null; informational: boolean; href: string | null;
};
/** 完成判定三型:AUTO=系統自動(綁訊號)、MANUAL=必做・手動勾選、INFO=純提醒(不勾選不計分) */
type CheckKind = 'AUTO' | 'MANUAL' | 'INFO';
const kindOf = (it: EItem): CheckKind => (it.autoKey ? 'AUTO' : it.informational ? 'INFO' : 'MANUAL');
const KIND_OPTS = [
  { value: 'AUTO', label: '系統自動判定' },
  { value: 'MANUAL', label: '必做・手動勾選' },
  { value: 'INFO', label: '純提醒(不勾選)' },
];
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
  const [itemForm, setItemForm] = useState({ title: '', hint: '', role: '', kind: 'MANUAL' as CheckKind, autoKey: '', href: '' as string });
  // href 表單值:'__auto__'=系統推導(存 null);''=週期主頁;其餘=子路徑/錨點
  const HREF_AUTO = '__auto__';
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

  // 階段上移/下移:與相鄰階段交換 orderIndex(影響待辦卡「查看全部」與 /journey 的呈現順序;
  // 週期頁進度條為週期七狀態的狀態機,不受範本順序影響)
  async function moveStage(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    setBusy(true);
    const a = stages[idx];
    const b = stages[target];
    // 以陣列位置為準重排(既有 orderIndex 可能重複)
    const r1 = await fetch(`/api/admin/journey/stages/${a.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderIndex: target }),
    });
    const r2 = await fetch(`/api/admin/journey/stages/${b.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderIndex: idx }),
    });
    setBusy(false);
    if (!r1.ok || !r2.ok) { toast.error('調整順序失敗'); return; }
    router.refresh();
  }

  // ── 項目 ──
  function openAddItem(stageId: string) {
    setItemEditing(null);
    setItemStageId(stageId);
    setItemForm({ title: '', hint: '', role: '', kind: 'MANUAL', autoKey: '', href: HREF_AUTO });
    setItemOpen(true);
  }
  function openEditItem(stageId: string, it: EItem) {
    setItemEditing(it);
    setItemStageId(stageId);
    setItemForm({
      title: it.title,
      hint: it.hint ?? '',
      role: it.role ?? '',
      kind: kindOf(it),
      autoKey: it.autoKey ?? '',
      href: it.href == null ? HREF_AUTO : it.href,
    });
    setItemOpen(true);
  }
  async function submitItem() {
    if (itemForm.title.trim().length < 1) { toast.error('請輸入項目內容'); return; }
    if (scope === 'CYCLE' && itemForm.kind === 'AUTO' && !itemForm.autoKey) {
      toast.error('請選擇系統訊號', '「系統自動判定」需綁定一個完成訊號');
      return;
    }
    setBusy(true);
    const roleVal = scope === 'CYCLE' ? itemForm.role || null : null;
    // 完成判定 → API 欄位:AUTO=帶 autoKey;MANUAL=兩者皆空;INFO=informational
    const checkFields = scope === 'CYCLE'
      ? {
          autoKey: itemForm.kind === 'AUTO' ? itemForm.autoKey : null,
          informational: itemForm.kind === 'INFO',
          href: itemForm.href === HREF_AUTO ? null : itemForm.href,
        }
      : { informational: itemForm.kind === 'INFO' };
    const url = itemEditing ? `/api/admin/journey/items/${itemEditing.id}` : '/api/admin/journey/items';
    const res = await fetch(url, {
      method: itemEditing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        itemEditing
          ? { title: itemForm.title.trim(), hint: itemForm.hint.trim() || null, role: roleVal, ...checkFields }
          : { stageId: itemStageId, title: itemForm.title.trim(), hint: itemForm.hint.trim() || null, role: roleVal, ...checkFields },
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
          {stages.map((s, si) => (
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
                  {/* 階段排序:影響待辦卡「查看全部」與 /journey 呈現順序 */}
                  <Button size="sm" variant="ghost" disabled={busy || si === 0} onClick={() => moveStage(si, -1)} aria-label={`上移階段 ${s.title}`}>↑</Button>
                  <Button size="sm" variant="ghost" disabled={busy || si === stages.length - 1} onClick={() => moveStage(si, 1)} aria-label={`下移階段 ${s.title}`}>↓</Button>
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
                          {/* 完成判定型態:系統自動(綁訊號)/必做手動勾/純提醒 */}
                          {kindOf(it) === 'AUTO' ? (
                            <Chip tone="primary" size="sm" title={AUTO_KEY_OPTIONS.find((o) => o.key === it.autoKey)?.label}>系統自動</Chip>
                          ) : kindOf(it) === 'INFO' ? (
                            <Chip tone="neutral" size="sm">提醒</Chip>
                          ) : (
                            <Chip tone="warning" size="sm">手動勾選</Chip>
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
              填對應週期狀態(DRAFT / PREPARATION / READY / ONSITE / REPORT_ISSUED / REMEDIATION / CLOSED)可在週期頁自動展開目前階段;也可自訂任意代碼(自訂階段照常顯示於「查看全部」,但不會自動對應目前階段)。
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

          {/* 完成判定:系統自動(綁訊號)/必做手動/純提醒(CYCLE 三選;PROGRAMME 只分手動與提醒) */}
          <div>
            <p className="text-caption font-medium text-on-surface-variant mb-1.5">完成判定</p>
            <Segmented
              value={itemForm.kind}
              onChange={(v) => setItemForm((f) => ({ ...f, kind: v as CheckKind }))}
              options={scope === 'CYCLE' ? KIND_OPTS : KIND_OPTS.filter((o) => o.value !== 'AUTO')}
            />
            <p className="mt-1.5 text-caption text-on-surface-variant leading-relaxed">
              {itemForm.kind === 'AUTO'
                ? '由系統依週期實況自動打勾(選擇下方訊號)。'
                : itemForm.kind === 'MANUAL'
                  ? '需人工確認完成後手動打勾;計入進度。'
                  : '僅提醒用途:不顯示勾選框、不計入進度。'}
            </p>
          </div>
          {scope === 'CYCLE' && itemForm.kind === 'AUTO' && (
            <Select label="系統訊號" value={itemForm.autoKey} onChange={(e) => setItemForm((f) => ({ ...f, autoKey: e.target.value }))}>
              <option value="">選擇完成訊號…</option>
              {AUTO_KEY_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </Select>
          )}
          {scope === 'CYCLE' && (
            <Select label="快捷跳轉" value={itemForm.href} onChange={(e) => setItemForm((f) => ({ ...f, href: e.target.value }))}>
              <option value={HREF_AUTO}>系統自動推導(依訊號/標題)</option>
              {HREF_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
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
