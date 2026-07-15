'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { Plus, Settings, Bell, Trash2, MapPin, FileText, Paperclip, User, CalendarDays, ChevronDown } from '@/components/icons';
import { targetTone, surveyDocDisplay, availabilityTone } from '@/lib/pre-survey';
import {
  SURVEY_AVAILABILITY_LABELS,
  SURVEY_COMMITTEE_TYPES,
  SURVEY_REPLY_STATUS_LABELS,
  SURVEY_DOC_HANDOVER_LABELS,
  SURVEY_REPLY_STATUSES,
  SURVEY_DOC_HANDOVER_STATUSES,
  SURVEY_TEMPLATE_SLOTS,
  SURVEY_TEMPLATE_SLOT_LABELS,
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
  docStatus: string;
  docReviewed: boolean;
  rejectReason: string | null;
  cvFile: { id: string; name: string } | null;
  ndaFile: { id: string; name: string } | null;
  priorCvFile: { id: string; name: string } | null; // 中心提供的舊版經歷說明書參考
  transport: string[];
  diet: string[];
  travelNote: string | null;
  customValues: Record<string, string>; // columnId → 值
  availability: Record<string, string>; // sessionId → status
  finalSessionIds: string[];
};
export type PoolUser = { id: string; name: string; email: string };
export type AdminTemplateDTO = { id: string; slot: string; label: string; fileId: string | null; fileName: string | null };
export type AdminColumnDTO = { id: string; title: string };

export default function SurveyAdminBoard({
  yearROC,
  sessions,
  participants,
  memberPool,
  observerPool,
  templates,
  customColumns,
}: {
  yearROC: number;
  sessions: AdminSessionDTO[];
  participants: AdminParticipantDTO[];
  memberPool: PoolUser[];
  observerPool: PoolUser[];
  templates: AdminTemplateDTO[];
  customColumns: AdminColumnDTO[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<SurveyParticipantKind>('MEMBER');
  const [sessionMgrOpen, setSessionMgrOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<AdminParticipantDTO | null>(null);
  const [removeFor, setRemoveFor] = useState<AdminParticipantDTO | null>(null);
  const [reviewFor, setReviewFor] = useState<AdminParticipantDTO | null>(null);
  const [profileFor, setProfileFor] = useState<AdminParticipantDTO | null>(null);
  const [templateMgrOpen, setTemplateMgrOpen] = useState(false);
  const [sortSessionId, setSortSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const list = participants.filter((p) => p.kind === kind);
    if (!sortSessionId) return list;
    // 一鍵分組:該場次「OK」者排前(穩定排序,不改其餘相對序)
    return [...list].sort((a, b) => {
      const av = a.availability[sortSessionId] === 'OK' ? 0 : 1;
      const bv = b.availability[sortSessionId] === 'OK' ? 0 : 1;
      return av - bv;
    });
  }, [participants, kind, sortSessionId]);

  const targetField = kind === 'OBSERVER' ? 'targetObserverCount' : 'targetMemberCount';
  const colCount = sessions.length + customColumns.length + 10 + (kind === 'MEMBER' ? 1 : 0);

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
  const setCustomValue = (pid: string, columnId: string, value: string) =>
    call(`/api/pre-survey/participants/${pid}`, 'PATCH', { customValue: { columnId, value } });

  async function remind(p: AdminParticipantDTO, stage: 1 | 2) {
    setBusy(true);
    const res = await fetch(`/api/pre-survey/participants/${p.id}/remind?stage=${stage}`, { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '催辦失敗' }));
      toast.error('催辦失敗', j.error);
      return;
    }
    const j = await res.json().catch(() => ({ recipientCount: 0 }));
    if (j.recipientCount > 0) toast.success(`已寄出催辦（${stage === 2 ? '差旅' : '意願'}）`, p.name);
    else if (stage === 2) toast.warning('未寄送', '該人員尚未被指派最終場次，或帳號已停用。');
    else toast.warning('未寄送', '該帳號已停用或查無收件人。');
  }

  async function addColumn() {
    await call('/api/pre-survey/columns', 'POST', { year: yearROC + 1911, title: '新欄位' }, '已新增欄位');
  }
  const renameColumn = (id: string, title: string) => call('/api/pre-survey/columns', 'PATCH', { id, title });

  return (
    <div className="space-y-6">
      {/* 系統檔案管理區(公版範本 + 個別委員舊版經歷說明書) */}
      <FileManagementCard
        kind={kind}
        templates={templates}
        members={participants.filter((p) => p.kind === 'MEMBER')}
        onManageTemplates={() => setTemplateMgrOpen(true)}
      />

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
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outlined" leadingIcon={<Plus size={15} />} onClick={addColumn} disabled={busy}>
            新增欄位
          </Button>
          <Button size="sm" variant="outlined" leadingIcon={<Settings size={15} />} onClick={() => setSessionMgrOpen(true)}>
            管理場次
          </Button>
          <Button href={`/api/pre-survey/export?year=${yearROC + 1911}&kind=${kind}`} size="sm" variant="outlined" download>
            匯出 CSV
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
                <th className="px-3 py-2.5 text-left font-medium min-w-[120px]">資料繳交</th>
                {/* 左群組:最終場次 / 意願回信 */}
                <th className="px-3 py-2.5 text-left font-medium min-w-[130px]">最終場次</th>
                <th className="px-3 py-2.5 text-left font-medium">意願回信</th>
                {/* 場次意願(點表頭一鍵分組) */}
                {sessions.map((s, i) => {
                  const active = sortSessionId === s.id;
                  return (
                    <th
                      key={s.id}
                      className={`px-2 py-2.5 text-center font-medium min-w-[92px] cursor-pointer select-none hover:text-ink-700 ${active ? 'bg-primary-50 text-primary-700' : ''}`}
                      title={`${s.dateLabel} ${s.name}（點擊依此場次 OK 分組）`}
                      onClick={() => setSortSessionId(active ? null : s.id)}
                    >
                      <div className="text-ink-700">{s.dateLabel}</div>
                      <div className="text-ink-900 truncate max-w-[88px] inline-flex items-center gap-0.5">
                        {s.name}{active && <ChevronDown size={11} />}
                      </div>
                      <div className="text-[10px] text-ink-500">（場次 {i + 1})</div>
                    </th>
                  );
                })}
                {/* 右群組:文件交接 / 交通 / 飲食 / 電話 / 備註 */}
                <th className="px-3 py-2.5 text-left font-medium">文件交接</th>
                <th className="px-3 py-2.5 text-left font-medium min-w-[110px]">交通</th>
                <th className="px-3 py-2.5 text-left font-medium min-w-[110px]">飲食</th>
                <th className="px-3 py-2.5 text-left font-medium min-w-[110px]">聯絡電話</th>
                <th className="px-3 py-2.5 text-left font-medium min-w-[130px]">備註</th>
                {/* 自訂欄位(可改名 / 刪除) */}
                {customColumns.map((c) => (
                  <th key={c.id} className="px-2 py-2 text-left font-medium min-w-[120px]">
                    <div className="flex items-center gap-1">
                      <input
                        defaultValue={c.title}
                        onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== c.title) renameColumn(c.id, t); else if (!t) e.target.value = c.title; }}
                        className="w-full min-w-[60px] rounded bg-transparent px-1 py-0.5 text-caption font-medium text-ink-700 focus-ring hover:bg-paper"
                        aria-label="自訂欄位標題"
                      />
                      <button
                        type="button"
                        onClick={() => call('/api/pre-survey/columns', 'DELETE', { id: c.id }, '已刪除欄位')}
                        className="shrink-0 text-ink-400 hover:text-danger-600 focus-ring rounded"
                        title="刪除欄位"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-medium min-w-[80px]">動作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-3 py-10 text-center text-ink-500">
                    尚無{kind === 'OBSERVER' ? '觀察員' : '委員'}。點右上「新增」從帳號池加入。
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id} className="hover:bg-paper-sunk/40">
                    {/* 姓名(點擊開個人資料彈窗) */}
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setProfileFor(p)}
                        className="inline-flex items-center gap-2 font-medium text-ink-900 hover:text-primary-700 focus-ring rounded"
                        title="檢視個人資料"
                      >
                        <span className="inline-flex w-6 h-6 rounded-full bg-paper-sunk items-center justify-center text-caption text-ink-600 shrink-0">
                          {p.name.charAt(0)}
                        </span>
                        {p.name}
                      </button>
                    </td>
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
                    {/* 資料繳交(狀態 chip → 審核;催1/2階) */}
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1.5">
                        <button type="button" onClick={() => setReviewFor(p)} className="focus-ring rounded" title="檢視/審核文件">
                          {(() => {
                            const d = surveyDocDisplay(p.docStatus, p.docReviewed);
                            return <Chip size="sm" tone={d.tone}>{d.label}</Chip>;
                          })()}
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => remind(p, 1)}
                            className="text-[11px] rounded border border-rule px-1.5 py-0.5 text-ink-600 hover:bg-paper-sunk focus-ring"
                            title="催辦一階：出席意願與文件"
                          >
                            催1階
                          </button>
                          <button
                            type="button"
                            disabled={busy || p.finalSessionIds.length === 0}
                            onClick={() => remind(p, 2)}
                            className="text-[11px] rounded border border-rule px-1.5 py-0.5 text-ink-600 hover:bg-paper-sunk focus-ring disabled:opacity-40"
                            title={p.finalSessionIds.length === 0 ? '未指派最終場次，無法催二階' : '催辦二階：差旅與飲食'}
                          >
                            催2階
                          </button>
                        </div>
                      </div>
                    </td>
                    {/* 最終場次 */}
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
                    {/* 意願回信 */}
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
                    {/* 場次意願 */}
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
                    {/* 文件交接 */}
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
                    {/* 交通 / 飲食(唯讀;本人填) */}
                    <td className="px-3 py-2 text-caption text-ink-700">
                      {p.transport.length > 0 ? p.transport.join('、') : <span className="text-ink-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-caption text-ink-700">
                      {p.diet.length > 0 ? p.diet.join('、') : <span className="text-ink-400">—</span>}
                      {p.travelNote && <span className="block text-ink-400" title={p.travelNote}>備註…</span>}
                    </td>
                    {/* 聯絡電話(中心可改) */}
                    <td className="px-3 py-2">
                      <input
                        defaultValue={p.phone ?? ''}
                        onBlur={(e) => { if ((e.target.value.trim() || null) !== (p.phone ?? null)) patchParticipant(p.id, { phone: e.target.value.trim() || null }); }}
                        placeholder="—"
                        className="w-full min-w-[100px] rounded border border-rule bg-card px-2 py-1 text-caption focus-ring"
                      />
                    </td>
                    {/* 備註 */}
                    <td className="px-3 py-2">
                      <input
                        defaultValue={p.note ?? ''}
                        onBlur={(e) => { if ((e.target.value.trim() || null) !== (p.note ?? null)) patchParticipant(p.id, { note: e.target.value.trim() || null }); }}
                        placeholder="—"
                        className="w-full min-w-[110px] rounded border border-rule bg-card px-2 py-1 text-caption focus-ring"
                      />
                    </td>
                    {/* 自訂欄位值 */}
                    {customColumns.map((c) => (
                      <td key={c.id} className="px-2 py-2">
                        <input
                          defaultValue={p.customValues[c.id] ?? ''}
                          onBlur={(e) => { if ((e.target.value.trim()) !== (p.customValues[c.id] ?? '')) setCustomValue(p.id, c.id, e.target.value.trim()); }}
                          placeholder="—"
                          className="w-full min-w-[100px] rounded border border-rule bg-card px-2 py-1 text-caption focus-ring"
                        />
                      </td>
                    ))}
                    {/* 動作:移除 */}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end">
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
      <TemplateManagerDialog open={templateMgrOpen} onOpenChange={setTemplateMgrOpen} yearROC={yearROC} templates={templates} />
      <AddParticipantDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        yearROC={yearROC}
        kind={kind}
        pool={kind === 'OBSERVER' ? observerPool : memberPool}
        existingUserIds={new Set(participants.map((p) => p.userId))}
      />
      <AssignDialog participant={assignFor} sessions={sessions} onClose={() => setAssignFor(null)} />
      <DocReviewDialog participant={reviewFor} onClose={() => setReviewFor(null)} />
      <AdminProfileDialog participant={profileFor} sessions={sessions} onClose={() => setProfileFor(null)} />
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

// ── 系統檔案管理區(公版範本入口 + 個別委員舊版經歷說明書上傳) ──
function FileManagementCard({
  kind, templates, members, onManageTemplates,
}: {
  kind: SurveyParticipantKind;
  templates: AdminTemplateDTO[];
  members: AdminParticipantDTO[];
  onManageTemplates: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const uploadedCount = templates.filter((t) => t.fileId).length;
  const selected = members.find((m) => m.id === selectedId) ?? null;

  async function uploadPriorCv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!selectedId) { toast.error('請先選擇一位委員'); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error('檔案超過 20MB 上限'); return; }
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/pre-survey/participants/${selectedId}/prior-cv`, { method: 'POST', body: fd });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '上傳失敗' })); toast.error('上傳失敗', j.error); return; }
    toast.success('已上傳舊版經歷說明書', selected?.name);
    router.refresh();
  }
  async function removePriorCv() {
    if (!selectedId) return;
    const res = await fetch(`/api/pre-survey/participants/${selectedId}/prior-cv`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '刪除失敗' })); toast.error('刪除失敗', j.error); return; }
    toast.success('已刪除舊版參考件');
    router.refresh();
  }

  return (
    <Card variant="outlined">
      <div className="flex items-center gap-2 mb-4">
        <FileText size={16} className="text-primary-700" />
        <h3 className="text-label text-ink-900">系統檔案管理區</h3>
      </div>
      <div className={`grid gap-4 ${kind === 'MEMBER' ? 'md:grid-cols-2' : ''}`}>
        {/* 公版空白範本 */}
        <div className="rounded-md border border-rule bg-paper-sunk/40 p-4">
          <p className="text-body-sm font-medium text-ink-900">公版空白範本</p>
          <p className="mt-1 text-caption text-ink-500">
            全體受調者通用的空白切結書{kind === 'MEMBER' ? '與經歷說明書' : ''}等。目前已上傳 {uploadedCount} / {SURVEY_TEMPLATE_SLOTS.length} 槽。
          </p>
          <div className="mt-3">
            <Button size="sm" variant="outlined" leadingIcon={<Paperclip size={14} />} onClick={onManageTemplates}>
              管理公版範本
            </Button>
          </div>
        </div>
        {/* 個別委員舊版經歷說明書(僅委員) */}
        {kind === 'MEMBER' && (
          <div className="rounded-md border border-primary-100 bg-primary-50/40 p-4">
            <p className="text-body-sm font-medium text-ink-900">個別委員舊版經歷說明書</p>
            <p className="mt-1 text-caption text-ink-500">選擇委員，上傳其「去年舊版」經歷說明書供本人參考填寫。</p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="!py-1.5 text-caption min-w-[140px]">
                <option value="">選擇委員…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.priorCvFile ? '（已上傳）' : ''}</option>
                ))}
              </Select>
              <FileUploadButton size="sm" label="上傳" busy={busy} onChange={uploadPriorCv} />
            </div>
            {selected?.priorCvFile && (
              <p className="mt-2 text-caption text-ink-600 break-all">
                現有：
                <a href={`/api/pre-survey/files/${selected.priorCvFile.id}/download`} className="ml-1 text-primary-700 hover:underline">
                  {selected.priorCvFile.name}
                </a>
                <button type="button" onClick={removePriorCv} className="ml-2 text-danger-600 hover:underline focus-ring rounded">刪除</button>
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── 個人資料彈窗(中心視角詳情:聯絡/文件/意願/差旅一覽,真實地名) ──
function AdminProfileDialog({
  participant, sessions, onClose,
}: { participant: AdminParticipantDTO | null; sessions: AdminSessionDTO[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPhone(participant?.phone ?? '');
    setEmail(participant?.email ?? '');
  }, [participant]);

  if (!participant) return null;
  const p = participant;
  const isObserver = p.kind === 'OBSERVER';
  const assignedNames = sessions.filter((s) => p.finalSessionIds.includes(s.id)).map((s) => `${s.dateLabel} ${s.name}`);

  async function saveContact() {
    setSaving(true);
    const res = await fetch(`/api/pre-survey/participants/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: phone.trim() || null, email: email.trim() || null }),
    });
    setSaving(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '儲存失敗' })); toast.error('儲存失敗', j.error); return; }
    toast.success('已儲存聯絡資訊');
    router.refresh();
  }

  const docDisp = surveyDocDisplay(p.docStatus, p.docReviewed);

  return (
    <Dialog
      open={participant !== null}
      onOpenChange={(o) => { if (!o) onClose(); }}
      size="lg"
      title={
        <span className="inline-flex items-center gap-2">
          <User size={18} /> {p.name}
          <Chip size="sm" tone="neutral">{isObserver ? '觀察員' : p.committeeType ?? '委員'}</Chip>
          <Chip size="sm" tone={docDisp.tone}>{docDisp.label}</Chip>
        </span>
      }
    >
      <div className="space-y-5">
        {/* 聯絡資訊 */}
        <section>
          <h4 className="text-label text-ink-900 mb-2">聯絡資訊</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="電子郵件" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField label="聯絡電話" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="mt-2">
            <Button size="sm" variant="tonal" onClick={saveContact} loading={saving} disabled={saving}>儲存聯絡資訊</Button>
          </div>
        </section>

        {/* 個人文件 */}
        <section>
          <h4 className="text-label text-ink-900 mb-2">個人文件</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {!isObserver && <ProfileFileRow label="經歷說明書" file={p.cvFile} />}
            <ProfileFileRow label="保密切結書" file={p.ndaFile} />
            {!isObserver && <ProfileFileRow label="舊版經歷說明書（中心提供）" file={p.priorCvFile} />}
          </div>
          {p.docStatus === 'RETURNED' && p.rejectReason && (
            <p className="mt-2 text-caption text-danger-600">退補理由：{p.rejectReason}</p>
          )}
        </section>

        {/* 最終場次 */}
        <section>
          <h4 className="text-label text-ink-900 mb-2">最終場次</h4>
          {assignedNames.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {assignedNames.map((n) => <Chip key={n} size="sm" tone="primary">{n}</Chip>)}
            </div>
          ) : (
            <p className="text-caption text-ink-400">尚未指派（於管考表「最終場次」欄指派）</p>
          )}
        </section>

        {/* 場次意願(真實地名) */}
        <section>
          <h4 className="text-label text-ink-900 mb-2">場次意願</h4>
          {sessions.length === 0 ? (
            <p className="text-caption text-ink-400">此年度尚無場次。</p>
          ) : (
            <ul className="divide-y divide-rule rounded-md border border-rule">
              {sessions.map((s) => {
                const st = p.availability[s.id];
                return (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-caption text-ink-700 inline-flex items-center gap-1.5">
                      <CalendarDays size={13} className="text-ink-400" /> {s.dateLabel} {s.name}
                      {s.isRequired && <Chip size="sm" tone="danger">必參加</Chip>}
                    </span>
                    {st ? (
                      <Chip size="sm" tone={availabilityTone(st)}>{SURVEY_AVAILABILITY_LABELS[st as keyof typeof SURVEY_AVAILABILITY_LABELS] ?? st}</Chip>
                    ) : (
                      <span className="text-caption text-ink-400">未填</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 差旅與飲食(本人填,唯讀) */}
        <section>
          <h4 className="text-label text-ink-900 mb-2">差旅與飲食（第二階段）</h4>
          <div className="grid gap-3 sm:grid-cols-2 text-caption text-ink-700">
            <div><span className="text-ink-500">交通：</span> {p.transport.length > 0 ? p.transport.join('、') : '—'}</div>
            <div><span className="text-ink-500">飲食：</span> {p.diet.length > 0 ? p.diet.join('、') : '—'}</div>
          </div>
          {p.travelNote && <p className="mt-2 text-caption text-ink-700"><span className="text-ink-500">差旅備註：</span> {p.travelNote}</p>}
        </section>
      </div>
    </Dialog>
  );
}

function ProfileFileRow({ label, file }: { label: string; file: { id: string; name: string } | null }) {
  return (
    <div className="rounded-md border border-rule bg-card p-2.5">
      <p className="text-caption text-ink-500">{label}</p>
      {file ? (
        <a href={`/api/pre-survey/files/${file.id}/download?inline=1`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-caption text-primary-700 hover:underline break-all">
          <Paperclip size={12} /> {file.name}
        </a>
      ) : (
        <p className="mt-1 text-caption text-ink-400">未上傳</p>
      )}
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

// ── 文件審核對話框(檢視 cv/切結書 + 核可/退補) ──
function DocReviewDialog({ participant, onClose }: { participant: AdminParticipantDTO | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReason(participant?.rejectReason ?? '');
  }, [participant]);

  async function review(decision: 'APPROVE' | 'RETURN') {
    if (!participant) return;
    if (decision === 'RETURN' && !reason.trim()) {
      toast.error('退補必須填寫理由');
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/pre-survey/participants/${participant.id}/docs/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision, reason: reason.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '審核失敗' }));
      toast.error('審核失敗', j.error);
      return;
    }
    toast.success(decision === 'APPROVE' ? '文件已核可' : '已退補，通知受調者補件');
    onClose();
    router.refresh();
  }

  const canReview = participant?.docStatus === 'SUBMITTED';
  return (
    <Dialog
      open={participant !== null}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={participant ? `${participant.name} 的文件審核` : ''}
      description="檢視受調者繳交的文件；送審（已繳交）狀態可核可或退補。"
    >
      <div className="space-y-3 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          {participant && (() => {
            const d = surveyDocDisplay(participant.docStatus, participant.docReviewed);
            return <Chip size="sm" tone={d.tone}>{d.label}</Chip>;
          })()}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <FileRow label="經歷說明書" file={participant?.cvFile ?? null} hidden={participant?.kind === 'OBSERVER'} />
          <FileRow label="保密切結書" file={participant?.ndaFile ?? null} />
        </div>
        {canReview ? (
          <>
            <Textarea label="退補理由（退補時必填）" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => review('APPROVE')} loading={busy} disabled={busy}>核可</Button>
              <Button size="sm" variant="danger" onClick={() => review('RETURN')} loading={busy} disabled={busy}>退補</Button>
            </div>
          </>
        ) : (
          <p className="text-caption text-ink-500">
            {participant?.docStatus === 'RETURNED'
              ? '已退補，待受調者補件並重新送審後再審核。'
              : '受調者尚未送審文件。'}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function FileRow({ label, file, hidden }: { label: string; file: { id: string; name: string } | null; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div className="rounded-md border border-rule bg-card p-2.5">
      <p className="text-caption text-ink-500">{label}</p>
      {file ? (
        <a href={`/api/pre-survey/files/${file.id}/download?inline=1`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-caption text-primary-700 hover:underline break-all">
          <Paperclip size={12} /> {file.name}
        </a>
      ) : (
        <p className="mt-1 text-caption text-ink-400">未上傳</p>
      )}
    </div>
  );
}

// ── 公版範本管理對話框(逐槽上傳/替換/刪除) ──
function TemplateManagerDialog({
  open, onOpenChange, yearROC, templates,
}: { open: boolean; onOpenChange: (o: boolean) => void; yearROC: number; templates: AdminTemplateDTO[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const bySlot = new Map(templates.map((t) => [t.slot, t]));

  async function upload(slot: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error('檔案超過 20MB 上限'); return; }
    setBusySlot(slot);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('year', String(yearROC + 1911));
    fd.append('slot', slot);
    fd.append('label', SURVEY_TEMPLATE_SLOT_LABELS[slot as keyof typeof SURVEY_TEMPLATE_SLOT_LABELS] ?? slot);
    const res = await fetch('/api/pre-survey/templates', { method: 'POST', body: fd });
    setBusySlot(null);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '上傳失敗' })); toast.error('上傳失敗', j.error); return; }
    toast.success('已上傳範本');
    router.refresh();
  }
  async function del(id: string) {
    if (!window.confirm('確定刪除此公版範本？')) return;
    const res = await fetch('/api/pre-survey/templates', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '刪除失敗' })); toast.error('刪除失敗', j.error); return; }
    toast.success('已刪除範本');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`${yearROC} 年度公版範本`} description="上傳空白經歷說明書/切結書等範本，供委員/觀察員下載填寫。可為 Word 或 PDF。一槽一檔，重傳取代。">
      <div className="space-y-3 pt-2">
        {SURVEY_TEMPLATE_SLOTS.map((slot) => {
          const t = bySlot.get(slot);
          return (
            <div key={slot} className="flex items-center justify-between gap-3 rounded-md border border-rule bg-card p-3">
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-ink-900">{SURVEY_TEMPLATE_SLOT_LABELS[slot]}</p>
                {t?.fileId ? (
                  <a href={`/api/pre-survey/files/${t.fileId}/download`} className="text-caption text-primary-700 hover:underline break-all">{t.fileName}</a>
                ) : (
                  <p className="text-caption text-ink-400">尚未上傳</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <FileUploadButton size="sm" label={t ? '替換' : '上傳'} busy={busySlot === slot} onChange={(e) => upload(slot, e)} />
                {t && (
                  <button type="button" onClick={() => del(t.id)} className="text-caption text-danger-600 hover:underline focus-ring rounded">刪除</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
