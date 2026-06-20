'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';

type Auditor = { id: string; name: string; email: string };
type Assignment = { id: string; auditor: Auditor; role?: string };

export default function AssignAuditorsPanel({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [auditors, setAuditors] = useState<Auditor[]>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/cycles/${cycleId}/assignments`);
    if (!res.ok) return;
    const j = await res.json();
    setAssignments(j.items ?? []);
    setAuditors(j.auditors ?? []);
  }
  useEffect(() => { load(); }, [cycleId]);

  const assignedIds = new Set(assignments.map((a) => a.auditor.id));
  const available = auditors.filter((a) => !assignedIds.has(a.id));

  async function add() {
    if (!pick) return;
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/assignments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ auditorId: pick }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '指派失敗' }));
      toast.error('指派失敗', j.error);
      return;
    }
    setPick('');
    toast.success('已指派委員');
    await load();
    router.refresh();
  }

  async function setLead(auditorId: string) {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/assignments`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ auditorId, role: 'LEAD' }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success('已設為召集委員');
      await load();
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '設定失敗' }));
      toast.error('設定失敗', j.error);
    }
  }

  async function remove(auditorId: string) {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/assignments?auditorId=${auditorId}`, {
      method: 'DELETE',
    });
    setBusy(false);
    if (res.ok) {
      toast.success('已移除指派');
      await load();
      router.refresh();
    }
  }

  return (
    <Card className="mb-6">
      <CardTitle>稽核委員指派</CardTitle>
      <CardDescription>被指派的委員才能檢視本週期並進行審查；委員不得審查自己服務之機關。</CardDescription>

      <div className="mt-4 flex flex-col gap-3">
        {assignments.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">尚未指派任何委員</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {assignments.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-container pl-1 pr-2 py-0.5">
                <Chip tone={a.role === 'LEAD' ? 'primary' : 'sage'} size="md" dot>
                  {a.auditor.name}{a.role === 'LEAD' && ' · 召集'}
                </Chip>
                {a.role !== 'LEAD' && (
                  <button
                    type="button"
                    onClick={() => setLead(a.auditor.id)}
                    disabled={busy}
                    className="text-caption text-primary-700 hover:underline focus-ring rounded-sm px-1"
                    aria-label={`設 ${a.auditor.name} 為召集委員`}
                  >
                    設為召集
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(a.auditor.id)}
                  disabled={busy}
                  className="text-caption text-on-surface-variant hover:text-danger-700 focus-ring rounded-sm px-1"
                  aria-label={`移除 ${a.auditor.name}`}
                >
                  移除
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end flex-wrap">
          <div className="w-64 max-w-full">
            <Select label="新增委員" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">選擇稽核委員…</option>
              {available.map((a) => (
                <option key={a.id} value={a.id}>{a.name}（{a.email}）</option>
              ))}
            </Select>
          </div>
          <Button variant="tonal" onClick={add} disabled={!pick} loading={busy}>
            指派
          </Button>
        </div>
      </div>
    </Card>
  );
}
