'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';

type PersonRef = { id: string; name: string; email?: string };
type Pairing = { id: string; observer: PersonRef; mentor: PersonRef };

/**
 * 觀察員配對(批30 師徒制;中心進階設定):為觀察員指派本場次的「指導委員」。
 * 指導委員限本週期已指派之正式委員;觀察員練習內容僅指導委員與中心可見。
 * 名單凍結與委員指派同閘(實地稽核結束後不得增刪改)。
 */
export default function AssignObserversPanel({
  cycleId,
  canAssign,
}: {
  cycleId: string;
  canAssign: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [observers, setObservers] = useState<PersonRef[]>([]);
  const [mentors, setMentors] = useState<PersonRef[]>([]);
  const [pickObserver, setPickObserver] = useState('');
  const [pickMentor, setPickMentor] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);

  async function load() {
    const res = await fetch(`/api/cycles/${cycleId}/observers`);
    if (!res.ok) return;
    const j = await res.json();
    setPairings(j.items ?? []);
    setObservers(j.observers ?? []);
    setMentors(j.mentors ?? []);
  }
  useEffect(() => { load(); }, [cycleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pairedIds = new Set(pairings.map((p) => p.observer.id));
  const available = observers.filter((o) => !pairedIds.has(o.id));

  async function add() {
    if (!pickObserver || !pickMentor) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/observers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ observerId: pickObserver, mentorId: pickMentor }),
      });
      if (res.ok) {
        setPickObserver('');
        setPickMentor('');
        toast.success('已配對觀察員', '該觀察員可於觀察員審閱時段檢視資料,並於實地稽核起進行撰寫練習。');
        await load();
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '配對失敗' }));
        toast.error('配對失敗', j.error);
      }
    } catch {
      toast.error('配對失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function changeMentor(observerId: string, mentorId: string) {
    if (!mentorId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/observers`, {
        method: 'POST', // upsert:同 observer 改 mentor
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ observerId, mentorId }),
      });
      if (res.ok) {
        toast.success('已更換指導委員');
        await load();
      } else {
        const j = await res.json().catch(() => ({ error: '更換失敗' }));
        toast.error('更換失敗', j.error);
      }
    } catch {
      toast.error('更換失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function remove(observerId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/observers?observerId=${observerId}`, {
        method: 'DELETE',
      });
      setPendingRemove(null);
      if (res.ok) {
        toast.success('已移除配對', '練習紀錄留存(中心仍可檢視);該觀察員即失去此週期存取。');
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

  // 無觀察員帳號且無配對:不顯示整個面板(多數週期沒有觀察員,避免噪音)
  if (observers.length === 0 && pairings.length === 0) return null;

  return (
    <Card>
      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(o) => !o && setPendingRemove(null)}
        title="移除這位觀察員的配對?"
        description={pendingRemove ? `「${pendingRemove.name}」將失去此週期的存取;其練習紀錄留存,中心仍可檢視。` : undefined}
        confirmLabel="移除"
        tone="danger"
        loading={busy}
        onConfirm={() => { if (pendingRemove) void remove(pendingRemove.id); }}
      />
      <CardTitle>觀察員配對(師徒制)</CardTitle>
      <CardDescription>
        為觀察員指派本場次的指導委員(限已指派之稽核委員)。觀察員以獨立審閱時段檢視資料、
        於「稽核發現撰寫練習」練習撰寫;練習內容僅指導委員與中心可見,不進入正式報告。
      </CardDescription>

      {pairings.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-rule rounded-md border border-rule">
          {pairings.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <span className="text-body-sm font-medium text-ink-900">{p.observer.name}</span>
                {p.observer.email && <span className="ml-2 text-caption text-ink-500">{p.observer.email}</span>}
                <Chip size="sm" tone="neutral" className="ml-2">觀察員</Chip>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-caption text-ink-500">指導委員</span>
                {canAssign ? (
                  <Select
                    aria-label={`${p.observer.name} 的指導委員`}
                    value={p.mentor.id}
                    disabled={busy}
                    onChange={(e) => changeMentor(p.observer.id, e.target.value)}
                  >
                    {mentors.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </Select>
                ) : (
                  <span className="text-body-sm text-ink-900">{p.mentor.name}</span>
                )}
                {canAssign && (
                  <Button
                    size="sm"
                    variant="text"
                    disabled={busy}
                    onClick={() => setPendingRemove({ id: p.observer.id, name: p.observer.name })}
                  >
                    移除
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canAssign ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Select
            aria-label="選擇觀察員"
            value={pickObserver}
            disabled={busy || available.length === 0}
            onChange={(e) => setPickObserver(e.target.value)}
          >
            <option value="">{available.length === 0 ? '(無可配對的觀察員)' : '選擇觀察員…'}</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>{o.name}{o.email ? `(${o.email})` : ''}</option>
            ))}
          </Select>
          <Select
            aria-label="選擇指導委員"
            value={pickMentor}
            disabled={busy || mentors.length === 0}
            onChange={(e) => setPickMentor(e.target.value)}
          >
            <option value="">{mentors.length === 0 ? '(請先指派稽核委員)' : '選擇指導委員…'}</option>
            {mentors.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
          <Button size="sm" onClick={add} loading={busy} disabled={!pickObserver || !pickMentor}>
            配對
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-caption text-ink-500">實地稽核階段已結束,參與名單已凍結。</p>
      )}
    </Card>
  );
}
