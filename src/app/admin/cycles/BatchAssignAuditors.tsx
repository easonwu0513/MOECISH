'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';

type Auditor = { id: string; name: string; organizationId: string | null };
type Cyc = { id: string; label: string; organizationId: string };

/** 批次把一位委員指派到多個週期(沿用迴避原則,後端冪等)。 */
export default function BatchAssignAuditors({ auditors, cycles }: { auditors: Auditor[]; cycles: Cyc[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [auditorId, setAuditorId] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const auditor = auditors.find((a) => a.id === auditorId);
  const recuse = (c: Cyc) => Boolean(auditor?.organizationId && auditor.organizationId === c.organizationId);
  const assignable = cycles.filter((c) => !recuse(c));

  function toggle(id: string) {
    setChecked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function selectAllAssignable() {
    setChecked(new Set(assignable.map((c) => c.id)));
  }

  async function submit() {
    if (!auditorId) { toast.error('請先選擇委員'); return; }
    const ids = Array.from(checked).filter((id) => assignable.some((c) => c.id === id));
    if (ids.length === 0) { toast.error('請勾選至少一個可指派的週期'); return; }
    setBusy(true);
    const res = await fetch('/api/admin/assignments/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ auditorId, cycleIds: ids }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '指派失敗' }));
      toast.error('指派失敗', j.error);
      return;
    }
    const j = await res.json();
    toast.success('批次指派完成', `已指派 ${j.assigned} 個週期${j.skipped?.length ? `,略過 ${j.skipped.length}(已指派/迴避)` : ''}。`);
    setOpen(false);
    setChecked(new Set());
    setAuditorId('');
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="tonal" onClick={() => setOpen(true)}>批次指派委員</Button>
      <Dialog
        open={open}
        onOpenChange={(v) => !busy && setOpen(v)}
        title="批次指派委員"
        description="選一位委員,勾選要指派的週期一次套用;委員服務之機關會自動迴避(不可勾)。"
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={busy}>取消</Button>
            <Button variant="filled" onClick={submit} loading={busy}>確認指派({checked.size})</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select label="稽核委員" value={auditorId} onChange={(e) => { setAuditorId(e.target.value); setChecked(new Set()); }}>
            <option value="">選擇委員…</option>
            {auditors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>

          {auditorId && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-label text-on-surface">週期({checked.size} 已選)</p>
                <button type="button" onClick={selectAllAssignable} className="text-caption text-primary-700 hover:underline">全選可指派</button>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border border-outline-variant/70 divide-y divide-outline-variant/40">
                {cycles.map((c) => {
                  const r = recuse(c);
                  return (
                    <label key={c.id} className={`flex items-center gap-2.5 px-3 py-2.5 text-body-sm ${r ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-surface-container'}`}>
                      <input type="checkbox" disabled={r} checked={checked.has(c.id)} onChange={() => toggle(c.id)} className="accent-primary-600" />
                      <span className="flex-1 text-on-surface">{c.label}</span>
                      {r && <span className="text-caption text-warning-700 shrink-0">迴避</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
