'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { ASSIGN_ASPECTS, ASSIGN_ASPECT_LABELS, parseAssignDimensions, type AssignAspect } from '@/lib/audit-score';

type Auditor = { id: string; name: string; email: string };
type Assignment = { id: string; auditor: Auditor; role?: string; dimensions?: string | null };

export default function AssignAuditorsPanel({ cycleId, canAssign }: { cycleId: string; canAssign: boolean }) {
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
    try {
      const res = await fetch(`/api/cycles/${cycleId}/assignments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auditorId: pick }),
      });
      if (res.ok) {
        setPick('');
        toast.success('已指派委員');
        await load();
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '指派失敗' }));
        toast.error('指派失敗', j.error);
      }
    } catch {
      toast.error('指派失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function toggleDim(a: Assignment, aspect: AssignAspect) {
    const cur = parseAssignDimensions(a.dimensions ?? null);
    const next = cur.includes(aspect) ? cur.filter((x) => x !== aspect) : [...cur, aspect];
    setBusy(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/assignments`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auditorId: a.auditor.id, dimensions: next }),
      });
      if (res.ok) {
        await load();
      } else {
        const j = await res.json().catch(() => ({ error: '更新構面失敗' }));
        toast.error('更新構面失敗', j.error);
      }
    } catch {
      toast.error('更新構面失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function remove(auditorId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/assignments?auditorId=${auditorId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('已移除指派');
        await load();
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '移除失敗' }));
        toast.error('移除失敗', j.error);
      }
    } catch {
      toast.error('移除失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardTitle>稽核委員指派</CardTitle>
      <CardDescription>
        被指派的委員才能檢視並審查本週期(不得審查自己服務之機關)。勾選各委員負責構面,未勾視同全構面。
      </CardDescription>

      <div className="mt-4 flex flex-col gap-3">
        {assignments.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">尚未指派任何委員</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {assignments.map((a) => {
              const dims = parseAssignDimensions(a.dimensions ?? null);
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-3 py-2"
                >
                  <Chip tone="neutral" size="sm" dot className="shrink-0">{a.auditor.name}</Chip>
                  <div className="flex flex-wrap items-center gap-1">
                    {ASSIGN_ASPECTS.map((asp) => {
                      const on = dims.includes(asp);
                      return (
                        <button
                          key={asp}
                          type="button"
                          disabled={busy}
                          aria-pressed={on}
                          onClick={() => toggleDim(a, asp)}
                          className={cn(
                            'px-2 py-0.5 rounded-full text-caption border transition-colors focus-ring disabled:opacity-50',
                            on
                              ? 'bg-primary-600 border-primary-600 text-white'
                              : 'border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container',
                          )}
                        >
                          {ASSIGN_ASPECT_LABELS[asp]}
                        </button>
                      );
                    })}
                    {dims.length === 0 && (
                      <span className="text-caption text-on-surface-variant">全構面</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(a.auditor.id)}
                    disabled={busy}
                    className="ml-auto shrink-0 text-caption text-on-surface-variant hover:text-danger-700 focus-ring rounded-sm px-1"
                    aria-label={`移除 ${a.auditor.name}`}
                  >
                    移除
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {canAssign ? (
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
        ) : (
          <p className="rounded-lg border border-outline-variant/60 bg-surface-container px-3 py-2.5 text-body-sm text-on-surface-variant">
            實地稽核階段已結束,委員名單已凍結,無法再新增指派。如確需增補委員,請將週期回退至「實地稽核」階段後再指派。
          </p>
        )}
      </div>
    </Card>
  );
}
