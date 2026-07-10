'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Plus, Pencil, Trash2 } from '@/components/icons';
import { DEFICIENCY_ASPECTS, DEFICIENCY_ASPECT_LABELS, type DeficiencyAspect } from '@/lib/types';
import { FINDING_KINDS, FINDING_KIND_LABELS, FINDING_KIND_HINTS, type FindingKind } from '@/lib/audit-score';
import { fmtROCDateTime } from '@/lib/date';

export type PracticeItemDTO = {
  id: string;
  observerId: string;
  observerName: string;
  aspect: string;
  kind: string;
  content: string;
  checklistRef: string | null;
  createdAtISO: string;
  feedbacks: {
    id: string;
    mentorId: string;
    mentorName: string;
    content: string;
    createdAtISO: string;
  }[];
};

/**
 * 練習工作台(批30):
 * - observer:新增/就地編修/刪除自己的練習發現(三類發現同正式結構,但完全無評分)
 * - mentor:唯讀練習內容 + 逐條回饋(可修正/刪除自己的回饋)
 * - center:全部唯讀
 * 資料變動後 router.refresh() 重取 server 資料(單人低頻情境,不需樂觀更新)。
 */
export default function PracticePad({
  cycleId,
  viewerKind,
  canEdit,
  canFeedback,
  mentorObserverIds,
  userId,
  itemRefs,
  initialItems,
}: {
  cycleId: string;
  viewerKind: 'observer' | 'mentor' | 'center';
  canEdit: boolean;
  canFeedback: boolean;
  /** 本人擔任指導者的觀察員 ids:回饋表單僅對這些觀察員的練習開放(中心人員可為部分觀察員的指導者) */
  mentorObserverIds: string[];
  userId: string;
  itemRefs: string[];
  initialItems: PracticeItemDTO[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PracticeItemDTO | null>(null);

  // 新增表單(observer)
  const [draftOpen, setDraftOpen] = useState(false);
  const [dKind, setDKind] = useState<FindingKind>('IMPROVE');
  const [dAspect, setDAspect] = useState<DeficiencyAspect>('STRATEGY');
  const [dRef, setDRef] = useState('');
  const [dContent, setDContent] = useState('');

  async function addFinding() {
    if (dContent.trim().length < 5) {
      toast.error('內容至少 5 字', '請補述練習發現內容。');
      return;
    }
    setBusy('add');
    const res = await fetch(`/api/cycles/${cycleId}/practice-findings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: dKind, aspect: dAspect, content: dContent, checklistRef: dRef || undefined }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '新增失敗' }));
      toast.error('新增失敗', j.error);
      return;
    }
    toast.success('已新增練習發現', '指導委員與中心可檢視並回饋。');
    setDContent('');
    setDRef('');
    setDraftOpen(false);
    router.refresh();
  }

  async function doDelete(item: PracticeItemDTO) {
    setBusy(item.id);
    const res = await fetch(`/api/practice-findings/${item.id}`, { method: 'DELETE' });
    setBusy(null);
    setDeleting(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '刪除失敗' }));
      toast.error('刪除失敗', j.error);
      return;
    }
    toast.success('已刪除練習發現');
    router.refresh();
  }

  // 依觀察員分組(mentor/center 多人;observer 只有自己一組,不顯示分組標題)
  const byObserver = new Map<string, PracticeItemDTO[]>();
  for (const it of initialItems) {
    const arr = byObserver.get(it.observerId) ?? [];
    arr.push(it);
    byObserver.set(it.observerId, arr);
  }

  return (
    <section className="flex flex-col gap-5">
      <datalist id="practice-item-refs">
        {itemRefs.map((r) => <option key={r} value={r} />)}
      </datalist>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="刪除這條練習發現？"
        description={deleting ? `「${deleting.content.slice(0, 60)}${deleting.content.length > 60 ? '…' : ''}」與其指導回饋將一併刪除,無法復原。` : undefined}
        confirmLabel="刪除"
        tone="danger"
        loading={busy === deleting?.id}
        onConfirm={() => { if (deleting) void doDelete(deleting); }}
      />

      {canEdit && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>新增練習發現</CardTitle>
              <CardDescription>選擇類型與構面,對應檢核項次選填;內容照正式發現的寫法練習。</CardDescription>
            </div>
            {!draftOpen && (
              <Button size="sm" variant="tonal" leadingIcon={<Plus size={14} />} onClick={() => setDraftOpen(true)}>
                開始撰寫
              </Button>
            )}
          </div>
          {draftOpen && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-wrap gap-3">
                <Select label="類型" value={dKind} onChange={(e) => setDKind(e.target.value as FindingKind)}>
                  {FINDING_KINDS.map((k) => (
                    <option key={k} value={k}>{FINDING_KIND_LABELS[k]}</option>
                  ))}
                </Select>
                <Select label="構面" value={dAspect} onChange={(e) => setDAspect(e.target.value as DeficiencyAspect)}>
                  {DEFICIENCY_ASPECTS.map((a) => (
                    <option key={a} value={a}>{DEFICIENCY_ASPECT_LABELS[a]}</option>
                  ))}
                </Select>
                <TextField
                  label="對應檢核項次(選填)"
                  value={dRef}
                  onChange={(e) => setDRef(e.target.value)}
                  placeholder="如 7.4"
                  list="practice-item-refs"
                />
              </div>
              <p className="text-caption text-ink-500">{FINDING_KIND_HINTS[dKind]}</p>
              <Textarea
                value={dContent}
                onChange={(e) => setDContent(e.target.value)}
                rows={4}
                placeholder="練習撰寫發現內容(具體缺失或不符之處、依據與改善建議)…"
              />
              <div className="flex gap-2">
                <Button size="sm" loading={busy === 'add'} onClick={addFinding}>新增此條</Button>
                <Button size="sm" variant="ghost" disabled={busy === 'add'} onClick={() => setDraftOpen(false)}>收合</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {initialItems.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-body-sm text-ink-500">
            {viewerKind === 'observer' ? '尚無練習發現;按「開始撰寫」新增第一條。' : '該觀察員尚未撰寫練習發現。'}
          </p>
        </Card>
      ) : (
        [...byObserver.entries()].map(([obsId, items]) => (
          <Card key={obsId}>
            {viewerKind !== 'observer' && (
              <div className="mb-3 flex items-center gap-2">
                <CardTitle>{items[0].observerName}</CardTitle>
                <Chip size="sm" tone="neutral">觀察員 · {items.length} 條練習</Chip>
              </div>
            )}
            <div className="flex flex-col divide-y divide-rule">
              {items.map((it) => (
                <PracticeRow
                  key={it.id}
                  item={it}
                  canEdit={canEdit && it.observerId === userId}
                  canFeedback={canFeedback && mentorObserverIds.includes(it.observerId)}
                  userId={userId}
                  onDelete={() => setDeleting(it)}
                />
              ))}
            </div>
          </Card>
        ))
      )}
    </section>
  );
}

function PracticeRow({
  item,
  canEdit,
  canFeedback,
  userId,
  onDelete,
}: {
  item: PracticeItemDTO;
  canEdit: boolean;
  canFeedback: boolean;
  userId: string;
  onDelete: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.content);
  const [aspect, setAspect] = useState(item.aspect);
  const [kind, setKind] = useState(item.kind);
  const [ref, setRef] = useState(item.checklistRef ?? '');
  const [saving, setSaving] = useState(false);
  const [fbText, setFbText] = useState('');
  const [fbBusy, setFbBusy] = useState(false);

  async function save() {
    if (text.trim().length < 5) {
      toast.error('內容至少 5 字');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/practice-findings/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text, aspect, kind, checklistRef: ref || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return;
    }
    toast.success('已儲存練習發現');
    setEditing(false);
    router.refresh();
  }

  async function sendFeedback() {
    if (!fbText.trim()) return;
    setFbBusy(true);
    const res = await fetch(`/api/practice-findings/${item.id}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: fbText }),
    });
    setFbBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '回饋失敗' }));
      toast.error('回饋失敗', j.error);
      return;
    }
    toast.success('已送出回饋');
    setFbText('');
    router.refresh();
  }

  async function deleteFeedback(fbid: string) {
    setFbBusy(true);
    const res = await fetch(`/api/practice-feedback/${fbid}`, { method: 'DELETE' });
    setFbBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '刪除失敗' }));
      toast.error('刪除失敗', j.error);
      return;
    }
    toast.success('已刪除回饋');
    router.refresh();
  }

  return (
    <div className="py-4 first:pt-0 last:pb-0 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip size="sm" tone="primary">{FINDING_KIND_LABELS[item.kind as FindingKind] ?? item.kind}</Chip>
        <Chip size="sm" tone="neutral">{DEFICIENCY_ASPECT_LABELS[item.aspect as DeficiencyAspect] ?? item.aspect}</Chip>
        {item.checklistRef && <Chip size="sm" tone="neutral" className="font-mono">{item.checklistRef}</Chip>}
        <span className="text-caption text-ink-500">{fmtROCDateTime(new Date(item.createdAtISO))}</span>
        {canEdit && !editing && (
          <span className="ml-auto flex gap-1">
            <Button size="sm" variant="text" leadingIcon={<Pencil size={13} />} onClick={() => setEditing(true)}>
              修正
            </Button>
            <Button size="sm" variant="text" leadingIcon={<Trash2 size={13} />} onClick={onDelete}>
              刪除
            </Button>
          </span>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-3">
            <Select label="類型" value={kind} onChange={(e) => setKind(e.target.value)}>
              {FINDING_KINDS.map((k) => (
                <option key={k} value={k}>{FINDING_KIND_LABELS[k]}</option>
              ))}
            </Select>
            <Select label="構面" value={aspect} onChange={(e) => setAspect(e.target.value)}>
              {DEFICIENCY_ASPECTS.map((a) => (
                <option key={a} value={a}>{DEFICIENCY_ASPECT_LABELS[a]}</option>
              ))}
            </Select>
            <TextField label="對應檢核項次" value={ref} onChange={(e) => setRef(e.target.value)} list="practice-item-refs" />
          </div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
          <div className="flex gap-2">
            <Button size="sm" loading={saving} onClick={save}>儲存</Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => { setEditing(false); setText(item.content); setAspect(item.aspect); setKind(item.kind); setRef(item.checklistRef ?? ''); }}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-body-sm text-ink-900 leading-relaxed">{item.content}</p>
      )}

      {/* 指導回饋串:mentor 具名回饋;作者可修正/刪除自己的回饋(此處僅提供刪除,修正=刪後重寫,低頻夠用) */}
      {(item.feedbacks.length > 0 || canFeedback) && (
        <div className="rounded-md bg-paper-sunk px-3.5 py-3 flex flex-col gap-2.5">
          <p className="text-caption font-medium text-ink-700">指導委員回饋</p>
          {item.feedbacks.length === 0 && !canFeedback && (
            <p className="text-caption text-ink-500">尚無回饋。</p>
          )}
          {item.feedbacks.map((fb) => (
            <div key={fb.id} className="border-l-2 border-primary-300 pl-3">
              <div className="flex items-center gap-2">
                <span className="text-caption text-ink-500">{fb.mentorName} · {fmtROCDateTime(new Date(fb.createdAtISO))}</span>
                {canFeedback && fb.mentorId === userId && (
                  <Button size="sm" variant="text" disabled={fbBusy} onClick={() => void deleteFeedback(fb.id)}>
                    刪除
                  </Button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-body-sm text-ink-900 leading-relaxed">{fb.content}</p>
            </div>
          ))}
          {canFeedback && (
            <div className="flex flex-col gap-2">
              <Textarea
                value={fbText}
                onChange={(e) => setFbText(e.target.value)}
                rows={2}
                placeholder="給這條練習的回饋(寫法、依據、改善建議的具體性…)"
              />
              <div>
                <Button size="sm" variant="tonal" loading={fbBusy} onClick={sendFeedback} disabled={!fbText.trim()}>
                  送出回饋
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
