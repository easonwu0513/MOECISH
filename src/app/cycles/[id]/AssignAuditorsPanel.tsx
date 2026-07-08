'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { ASSIGN_ASPECTS, ASSIGN_ASPECT_LABELS, parseAssignDimensions, type AssignAspect } from '@/lib/audit-score';

type Auditor = { id: string; name: string; email: string };
type Assignment = { id: string; auditor: Auditor; role?: string; dimensions?: string | null; scoreLockedAt?: string | null };

export default function AssignAuditorsPanel({
  cycleId,
  canAssign,
  confirmOnAssign = false,
}: {
  cycleId: string;
  canAssign: boolean;
  /** 實地稽核進行中:新增委員=立即取得本週期審查權限,比照移除加事前確認視窗(UAT 批61) */
  confirmOnAssign?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [auditors, setAuditors] = useState<Auditor[]>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  // 移除指派為不可逆(刪除指派紀錄含負責構面;已定稿委員後端會擋,列上直接鎖定)→ 正式確認對話框防誤刪
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);
  // 實地稽核階段新增委員的事前確認(confirmOnAssign 時啟用)
  const [pendingAssign, setPendingAssign] = useState<{ id: string; name: string } | null>(null);

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

  /** 指派入口:實地稽核進行中先跳確認視窗,其餘階段直接指派 */
  function requestAdd() {
    if (!pick) return;
    if (confirmOnAssign) {
      const auditor = available.find((a) => a.id === pick);
      setPendingAssign({ id: pick, name: auditor?.name ?? '此委員' });
      return;
    }
    void add();
  }

  async function add() {
    if (!pick) return;
    setPendingAssign(null);
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
        // 通知同頁觀察員配對面板更新指導池(其為獨立 client fetch,router.refresh 不會重跑)
        window.dispatchEvent(new CustomEvent('moecish:auditors-changed'));
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
      setPendingRemove(null);
      if (res.ok) {
        toast.success('已移除指派');
        await load();
        window.dispatchEvent(new CustomEvent('moecish:auditors-changed'));
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
          <p className="text-body-sm text-ink-500">尚未指派任何委員</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {assignments.map((a) => {
              const dims = parseAssignDimensions(a.dimensions ?? null);
              // 已定稿(確認填寫完畢)委員:構面/移除皆鎖定,須先於彙整報告頁退件(對齊後端 409 規則,避免確認後才吃閉門羹)
              const finalized = Boolean(a.scoreLockedAt);
              const rowLocked = !canAssign || finalized;
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-rule bg-card px-3 py-2"
                >
                  <Chip tone="neutral" size="sm" dot className="shrink-0">{a.auditor.name}</Chip>
                  {finalized && <Chip tone="success" size="sm" className="shrink-0">已定稿</Chip>}
                  <div className="flex flex-wrap items-center gap-1">
                    {ASSIGN_ASPECTS.map((asp) => {
                      const on = dims.includes(asp);
                      return (
                        <button
                          key={asp}
                          type="button"
                          disabled={busy || rowLocked}
                          aria-pressed={on}
                          title={finalized ? '已定稿,如需調整請先於彙整報告頁退件' : !canAssign ? '名單已凍結' : undefined}
                          onClick={() => toggleDim(a, asp)}
                          className={cn(
                            'px-2 py-0.5 rounded-full text-caption border transition-colors focus-ring disabled:opacity-50',
                            on
                              ? 'bg-primary-600 border-primary-600 text-white'
                              : 'border-neutral-400 bg-card text-ink-500 hover:bg-paper-sunk hover:border-neutral-500',
                          )}
                        >
                          {ASSIGN_ASPECT_LABELS[asp]}
                        </button>
                      );
                    })}
                    {dims.length === 0 && (
                      <span className="text-caption text-ink-500">全構面</span>
                    )}
                  </div>
                  {rowLocked ? (
                    <span className="ml-auto shrink-0 text-caption text-ink-500" title={finalized ? '如確需移除,請先於彙整報告頁「退件」解除定稿' : undefined}>
                      {finalized ? '已定稿・不可移除' : ''}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingRemove({ id: a.auditor.id, name: a.auditor.name })}
                      disabled={busy}
                      className="ml-auto shrink-0 text-caption text-ink-500 hover:text-danger-700 focus-ring rounded-sm px-1"
                      aria-label={`移除 ${a.auditor.name}`}
                    >
                      移除
                    </button>
                  )}
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
            <Button variant="tonal" onClick={requestAdd} disabled={!pick} loading={busy}>
              指派
            </Button>
          </div>
        ) : (
          <p className="rounded-md border border-rule bg-paper-sunk px-3 py-2.5 text-body-sm text-ink-500">
            實地稽核階段已結束,委員名單已凍結,無法再新增或移除指派、亦不可調整構面。如確需調整,請將週期回退至「開立中」後處理(重大操作,請審慎)。
          </p>
        )}
      </div>

      {/* 實地稽核階段新增委員確認:新增即立即取得檢視與審查權限,防誤點(比照移除的確認慣例) */}
      <ConfirmDialog
        open={pendingAssign !== null}
        onOpenChange={(o) => !busy && !o && setPendingAssign(null)}
        title="於實地稽核階段新增委員"
        description={
          pendingAssign
            ? `實地稽核已在進行中。指派後「${pendingAssign.name}」將立即取得本週期的檢視與審查權限(含機關檢核表與已齊備資料),並可填寫評分與稽核發現。確定要新增這位委員嗎?`
            : undefined
        }
        confirmLabel="確認指派"
        tone="primary"
        onConfirm={() => { if (pendingAssign) return add(); }}
        loading={busy}
      />

      {/* 移除指派確認(防誤刪):對齊全站不可逆動作一律 ConfirmDialog 的慣例 */}
      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(o) => !busy && !o && setPendingRemove(null)}
        title="移除委員指派"
        description={
          pendingRemove
            ? `移除後「${pendingRemove.name}」將立即失去本週期的檢視與審查權限;其負責構面的指派紀錄將一併刪除(已填寫的評分與稽核發現紀錄保留)。如僅需調整負責構面,直接點選構面即可,不必移除。確定要移除嗎?`
            : undefined
        }
        confirmLabel="移除"
        tone="danger"
        onConfirm={() => { if (pendingRemove) return remove(pendingRemove.id); }}
        loading={busy}
      />
    </Card>
  );
}
