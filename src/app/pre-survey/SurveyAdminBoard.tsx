'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import { Segmented } from '@/components/ui/Segmented';
import { useToast } from '@/components/ui/Toast';
import { Plus, Settings, Bell, Trash2, MapPin } from '@/components/icons';
import { targetTone } from '@/lib/pre-survey';
import {
  SURVEY_AVAILABILITY_LABELS,
  SURVEY_COMMITTEE_TYPES,
  SURVEY_REPLY_STATUS_LABELS,
  SURVEY_DOC_HANDOVER_LABELS,
  SURVEY_REPLY_STATUSES,
  SURVEY_DOC_HANDOVER_STATUSES,
  type SurveyParticipantKind,
} from '@/lib/types';

export type AdminSessionDTO = {
  id: string;
  name: string; // 真實地名(中心可見)
  dateLabel: string;
  dateInput: string | null; // YYYY-MM-DD 供編輯
  isRequired: boolean;
  remark: string | null;
  targetMemberCount: number;
  targetObserverCount: number;
};
export type AdminParticipantDTO = {
  id: string;
  userId: string; // 綁定帳號 id(去重以此為鍵,非顯示姓名——同名不同帳號)
  name: string;
  kind: SurveyParticipantKind;
  committeeType: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  replyStatus: string;
  docHandover: string;
  submittedAt: string | null;
  availability: Record<string, string>; // sessionId → status
  finalSessionIds: string[];
};
export type PoolUser = { id: string; name: string; email: string };

export default function SurveyAdminBoard({
  yearROC,
  sessions,
  participants,
  memberPool,
  observerPool,
}: {
  yearROC: number;
  sessions: AdminSessionDTO[];
  participants: AdminParticipantDTO[];
  memberPool: PoolUser[];
  observerPool: PoolUser[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<SurveyParticipantKind>('MEMBER');
  const [sessionMgrOpen, setSessionMgrOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<AdminParticipantDTO | null>(null);
  const [removeFor, setRemoveFor] = useState<AdminParticipantDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = participants.filter((p) => p.kind === kind);
  const targetField = kind === 'OBSERVER' ? 'targetObserverCount' : 'targetMemberCount';

  async function call(url: string, method: string, body?: unknown, okMsg?: string): Promise<boolean> {
    setBusy(true);
    const res = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '操作失敗' }));
      toast.error('操作失敗', j.error);
      router.refresh(); // 還原樂觀 UI
      return false;
    }
    if (okMsg) toast.success(okMsg);
    router.refresh();
    return true;
  }

  const setAvailability = (pid: string, sessionId: string, status: string) =>
    call(`/api/pre-survey/participants/${pid}/availability`, 'PUT', { sessionId, status });
  const patchParticipant = (pid: string, data: Record<string, unknown>) =>
    call(`/api/pre-survey/participants/${pid}`, 'PATCH', data);

  return (
    <div className="space-y-6">
      {/* 工具列 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Segmented
          value={kind}
          onChange={(v) => setKind(v)}
          options={[
            { value: 'MEMBER', label: '委員' },
            { value: 'OBSERVER', label: '觀察員' },
          ]}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outlined" leadingIcon={<Settings size={15} />} onClick={() => setSessionMgrOpen(true)}>
            管理場次
          </Button>
          <Button size="sm" leadingIcon={<Plus size={15} />} onClick={() => setAddOpen(true)}>
            新增{kind === 'OBSERVER' ? '觀察員' : '委員'}
          </Button>
        </div>
      </div>

      {/* 達標儀表卡 */}
      {sessions.length > 0 && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {sessions.map((s) => {
            const target = s[targetField];
            const ok = rows.filter((p) => p.availability[s.id] === 'OK').length;
            return (
              <Card key={s.id} variant="outlined" className="!p-3.5">
                <p className="text-caption text-ink-500 truncate">{s.dateLabel} · {s.name}</p>
                <p className="mt-1 text-title-md text-ink-900 tabular-nums">
                  {ok}<span className="text-body-sm text-ink-500"> / {target} 人</span>
                </p>
                <div className="mt-2 h-1.5 rounded-full bg-paper-sunk overflow-hidden">
                  <div
                    className={`h-full rounded-full ${targetTone(ok, target) === 'success' ? 'bg-success-500' : 'bg-primary-500'}`}
                    style={{ width: `${target > 0 ? Math.min(100, (ok / target) * 100) : 0}%` }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 管考矩陣 */}
      <Card variant="outlined" className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm border-collapse">
            <thead>
              <tr className="bg-paper-sunk text-caption text-ink-500">
                <th className="sticky left-0 z-10 bg-paper-sunk px-3 py-2.5 text-left font-medium min-w-[120px]">姓名</th>
                {kind === 'MEMBER' && <th className="px-3 py-2.5 text-left font-medium min-w-[100px]">類型</th>}
                <th className="px-3 py-2.5 text-left font-medium">送出</th>
                {sessions.map((s, i) => (
                  <th key={s.id} className="px-2 py-2.5 text-center font-medium min-w-[92px]" title={`${s.dateLabel} ${s.name}`}>
                    <div className="text-ink-700">{s.dateLabel}</div>
                    <div className="text-ink-900 truncate max-w-[88px]">{s.name}</div>
                    <div className="text-[10px] text-ink-500">（場次 {i + 1})</div>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-left font-medium min-w-[130px]">最終場次</th>
                <th className="px-3 py-2.5 text-left font-medium">意願回信</th>
                <th className="px-3 py-2.5 text-left font-medium">文件交接</th>
                <th className="px-3 py-2.5 text-left font-medium min-w-[110px]">備註</th>
                <th className="px-3 py-2.5 text-right font-medium min-w-[110px]">動作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={sessions.length + 7} className="px-3 py-10 text-center text-ink-500">
                    尚無{kind === 'OBSERVER' ? '觀察員' : '委員'}。點右上「新增」從帳號池加入。
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id} className="hover:bg-paper-sunk/40">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-ink-900 whitespace-nowrap">{p.name}</td>
                    {kind === 'MEMBER' && (
                      <td className="px-3 py-2">
                        <Select
                          value={p.committeeType ?? ''}
                          onChange={(e) => patchParticipant(p.id, { committeeType: e.target.value || null })}
                          className="!py-1 text-caption"
                        >
                          <option value="">未分類</option>
                          {SURVEY_COMMITTEE_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </Select>
                      </td>
                    )}
                    <td className="px-3 py-2">
                      {p.submittedAt ? <Chip size="sm" tone="success">已送</Chip> : <Chip size="sm" tone="warning">未送</Chip>}
                    </td>
                    {sessions.map((s) => (
                      <td key={s.id} className="px-2 py-2 text-center">
                        <Select
                          value={p.availability[s.id] ?? ''}
                          onChange={(e) => setAvailability(p.id, s.id, e.target.value || 'NA')}
                          className="!py-1 text-caption"
                          aria-label={`${p.name} 對 ${s.name} 意願`}
                        >
                          <option value="">未填</option>
                          <option value="OK">{SURVEY_AVAILABILITY_LABELS.OK}</option>
                          <option value="PENDING">{SURVEY_AVAILABILITY_LABELS.PENDING}</option>
                          <option value="NA">{SURVEY_AVAILABILITY_LABELS.NA}</option>
                        </Select>
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setAssignFor(p)}
                        className="inline-flex items-center gap-1 text-caption text-primary-700 hover:underline focus-ring rounded"
                      >
                        <MapPin size={13} />
                        {p.finalSessionIds.length > 0 ? `已指派 ${p.finalSessionIds.length} 場` : '指派'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={p.replyStatus}
                        onChange={(e) => patchParticipant(p.id, { replyStatus: e.target.value })}
                        className="!py-1 text-caption"
                      >
                        {SURVEY_REPLY_STATUSES.map((r) => (
                          <option key={r} value={r}>{SURVEY_REPLY_STATUS_LABELS[r]}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={p.docHandover}
                        onChange={(e) => patchParticipant(p.id, { docHandover: e.target.value })}
                        className="!py-1 text-caption"
                      >
                        {SURVEY_DOC_HANDOVER_STATUSES.map((d) => (
                          <option key={d} value={d}>{SURVEY_DOC_HANDOVER_LABELS[d]}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        defaultValue={p.note ?? ''}
                        onBlur={(e) => { if ((e.target.value.trim() || null) !== (p.note ?? null)) patchParticipant(p.id, { note: e.target.value.trim() || null }); }}
                        placeholder="—"
                        className="w-full min-w-[90px] rounded border border-rule bg-card px-2 py-1 text-caption focus-ring"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            const res = await fetch(`/api/pre-survey/participants/${p.id}/remind`, { method: 'POST' });
                            setBusy(false);
                            if (!res.ok) { const j = await res.json().catch(() => ({ error: '催辦失敗' })); toast.error('催辦失敗', j.error); return; }
                            const j = await res.json().catch(() => ({ recipientCount: 0 }));
                            if (j.recipientCount > 0) toast.success('已寄出催辦', `${p.name}`);
                            else toast.warning('未寄送', '該帳號已停用或查無收件人。');
                          }}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-500 hover:text-primary-700 hover:bg-primary-50 focus-ring"
                          title="催辦填意願"
                        >
                          <Bell size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemoveFor(p)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-500 hover:text-danger-600 hover:bg-danger-50 focus-ring"
                          title="移除"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <SessionManagerDialog open={sessionMgrOpen} onOpenChange={setSessionMgrOpen} yearROC={yearROC} sessions={sessions} />
      <AddParticipantDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        yearROC={yearROC}
        kind={kind}
        pool={kind === 'OBSERVER' ? observerPool : memberPool}
        existingUserIds={new Set(participants.map((p) => p.userId))}
      />
      <AssignDialog participant={assignFor} sessions={sessions} onClose={() => setAssignFor(null)} />
      <ConfirmDialog
        open={removeFor !== null}
        onOpenChange={(o) => { if (!o) setRemoveFor(null); }}
        title="移除受調人員"
        description={removeFor ? `確定將「${removeFor.name}」自本年度調查名單移除？其意願與指派將一併刪除。` : ''}
        confirmLabel="移除"
        tone="danger"
        onConfirm={async () => { if (removeFor) { await call(`/api/pre-survey/participants/${removeFor.id}`, 'DELETE', undefined, '已移除'); setRemoveFor(null); } }}
      />
    </div>
  );
}

// ── 場次管理對話框 ──
function SessionManagerDialog({
  open, onOpenChange, yearROC, sessions,
}: { open: boolean; onOpenChange: (o: boolean) => void; yearROC: number; sessions: AdminSessionDTO[] }) {
  const router = useRouter();
  const toast = useToast();
  const year = yearROC + 1911;
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [tm, setTm] = useState('4');
  const [to, setTo] = useState('1');
  const [required, setRequired] = useState(false);
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) { toast.error('請填寫場次名稱/地點'); return; }
    setBusy(true);
    const res = await fetch('/api/pre-survey/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ year, name: name.trim(), date: date || null, isRequired: required, remark: remark.trim() || undefined, targetMemberCount: Number(tm) || 0, targetObserverCount: Number(to) || 0 }),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '新增失敗' })); toast.error('新增失敗', j.error); return; }
    setName(''); setDate(''); setRemark('');
    toast.success('已新增場次');
    router.refresh();
  }
  async function del(id: string, label: string) {
    if (!window.confirm(`確定刪除場次「${label}」？其意願與指派將一併刪除。`)) return;
    const res = await fetch(`/api/pre-survey/sessions/${id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '刪除失敗' })); toast.error('刪除失敗', j.error); return; }
    toast.success('已刪除場次');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`管理 ${yearROC} 年度場次`} description="新增稽核場次（地點對受調者以序號匿名）；目標人數為達標儀表卡分母。">
      <div className="space-y-4 pt-2">
        <div className="rounded-md border border-rule bg-card p-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="場次名稱/地點" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：總院、斗六" />
            <TextField label="日期" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <TextField label="目標委員數" type="number" value={tm} onChange={(e) => setTm(e.target.value)} />
            <TextField label="目標觀察員數" type="number" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="mt-3">
            <TextField
              label="備註（受調者可見，勿含地點）"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="如：請至少勾選 2 場、上午 09:30 簽到"
            />
          </div>
          <label className="mt-3 flex items-center gap-2 text-body-sm text-ink-700">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="rounded border-rule" />
            必參加
          </label>
          <div className="mt-3">
            <Button size="sm" onClick={add} loading={busy} disabled={busy}>新增場次</Button>
          </div>
        </div>
        {sessions.length > 0 && (
          <ul className="divide-y divide-rule rounded-md border border-rule">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <span className="text-body-sm font-medium text-ink-900">{s.dateLabel} · {s.name}</span>
                  {s.isRequired && <Chip size="sm" tone="danger" className="ml-2">必參加</Chip>}
                  <span className="ml-2 text-caption text-ink-500">目標 委員 {s.targetMemberCount}／觀察員 {s.targetObserverCount}</span>
                </div>
                <button type="button" onClick={() => del(s.id, `${s.dateLabel} ${s.name}`)} className="text-caption text-danger-600 hover:underline focus-ring rounded">刪除</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

// ── 新增受調人員對話框 ──
function AddParticipantDialog({
  open, onOpenChange, yearROC, kind, pool, existingUserIds,
}: { open: boolean; onOpenChange: (o: boolean) => void; yearROC: number; kind: SurveyParticipantKind; pool: PoolUser[]; existingUserIds: Set<string> }) {
  const router = useRouter();
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [committeeType, setCommitteeType] = useState('');
  const [busy, setBusy] = useState(false);
  const label = kind === 'OBSERVER' ? '觀察員' : '委員';

  async function add() {
    if (!userId) { toast.error(`請選擇${label}`); return; }
    setBusy(true);
    const res = await fetch('/api/pre-survey/participants', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ year: yearROC + 1911, userId, kind, committeeType: kind === 'MEMBER' ? committeeType || null : null }),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '新增失敗' })); toast.error('新增失敗', j.error); return; }
    setUserId(''); setCommitteeType('');
    onOpenChange(false);
    toast.success(`已加入${label}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`新增受調${label}`} description={`從平台${label}帳號池選人加入 ${yearROC} 年度調查；若需新人，請先於「使用者管理」以既有邀請流程建立帳號。`}
      footer={<><Button variant="text" onClick={() => onOpenChange(false)}>取消</Button><Button onClick={add} loading={busy} disabled={busy}>加入</Button></>}>
      <div className="space-y-3 pt-2">
        <Select label={`選擇${label}`} value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">請選擇…</option>
          {pool.map((u) => (
            <option key={u.id} value={u.id} disabled={existingUserIds.has(u.id)}>
              {u.name}（{u.email}）{existingUserIds.has(u.id) ? '· 已加入' : ''}
            </option>
          ))}
        </Select>
        {kind === 'MEMBER' && (
          <Select label="委員類型（選填）" value={committeeType} onChange={(e) => setCommitteeType(e.target.value)}>
            <option value="">未分類</option>
            {SURVEY_COMMITTEE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        )}
      </div>
    </Dialog>
  );
}

// ── 指派最終場次對話框(多選,toggle-pill) ──
function AssignDialog({
  participant, sessions, onClose,
}: { participant: AdminParticipantDTO | null; sessions: AdminSessionDTO[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 開啟(participant 變更)時,以此人既有指派初始化本地選擇
  useEffect(() => {
    if (participant) setSelected(new Set(participant.finalSessionIds));
  }, [participant]);

  async function toggle(sessionId: string) {
    if (!participant || busy) return;
    const next = new Set(selected);
    if (next.has(sessionId)) next.delete(sessionId);
    else next.add(sessionId);
    setSelected(next); // 樂觀
    setBusy(true);
    const res = await fetch(`/api/pre-survey/participants/${participant.id}/assign`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionIds: [...next] }),
    });
    setBusy(false);
    if (!res.ok) {
      setSelected(new Set(participant.finalSessionIds)); // 回滾
      const j = await res.json().catch(() => ({ error: '指派失敗' }));
      toast.error('指派失敗', j.error);
      return;
    }
    router.refresh();
  }

  return (
    <Dialog
      open={participant !== null}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={participant ? `指派「${participant.name}」的最終場次` : ''}
      description="可複選；指派 ≥1 場即解鎖該受調者的差旅與飲食調查（第二階段）。"
    >
      <div className="flex flex-wrap gap-2 pt-2">
        {sessions.map((s) => {
          const on = selected.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              disabled={busy}
              onClick={() => toggle(s.id)}
              aria-pressed={on}
              className={`px-3 py-1.5 rounded-full text-caption font-medium border transition-colors focus-ring ${
                on ? 'bg-primary-600 text-white border-transparent' : 'bg-card border-rule text-ink-600 hover:bg-paper-sunk'
              }`}
            >
              {s.dateLabel} · {s.name}
            </button>
          );
        })}
        {sessions.length === 0 && <p className="text-body-sm text-ink-500">此年度尚無場次可指派。</p>}
      </div>
    </Dialog>
  );
}
