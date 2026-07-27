'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
  SURVEY_REPLY_STATUSES,
  SURVEY_TEMPLATE_SLOT_LABELS,
  surveyTemplateSlotLabel,
  SURVEY_TEMPLATE_SLOTS_BY_KIND,
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
  anonymizeForMember: boolean; // 對委員是否匿名地點
  anonymizeForObserver: boolean; // 對觀察員是否匿名地點
  sharedWithObserver: boolean; // 是否委員與觀察員共同場次(false=委員專屬,如委員共識會議)
  sourceCycleId: string | null; // UAT 圖13:由稽核週期帶入(非 null)→日期鎖定,隨週期實地稽核日連動
  needsTravel: boolean; // UAT 圖14:此場次是否需第二階段差旅(線上會議=false)
  isBriefing: boolean; // UAT 圖14:受稽機關說明會(年度必備,不可刪)
};
export type AdminParticipantDTO = {
  id: string;
  userId: string; // 綁定帳號 id(去重以此為鍵,非顯示姓名——同名不同帳號)
  name: string;
  kind: SurveyParticipantKind;
  committeeType: string | null; // UAT 圖28:「專長」可複選(JSON 陣列字串;舊單值相容)
  phone: string | null;
  email: string | null;
  phone2: string | null;
  email2: string | null;
  proxyName: string | null; // 代理聯絡人姓名/職稱(UAT 圖16)
  proxyEmail: string | null; // 代理聯絡人信箱(UAT;null=無代理)
  proxyPhone: string | null; // 代理聯絡人電話
  note: string | null;
  replyStatus: string;
  submittedAt: string | null;
  editUnlocked: boolean; // 中心已對此人開放一階補填/變更(意願/文件;逾第一時窗仍可編修)
  travelEditUnlocked: boolean; // 圖55:二階(差旅/飲食)補填開放獨立開關
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
  finalAspects: Record<string, string | null>; // UAT 圖28:sessionId → 該場次被指派的構面(null=免構面,如說明會)
  receiptReturned: boolean; // UAT 圖36:委員是否已回傳領據(寄信收送;中心勾選統計)
};
export type PoolUser = { id: string; name: string; email: string };
export type AdminTemplateDTO = { id: string; slot: string; label: string; fileId: string | null; fileName: string | null };
export type AdminColumnDTO = { id: string; title: string; selfEditable: boolean; dueDate: string | null };

export default function SurveyAdminBoard({
  yearROC,
  sessions,
  participants,
  memberPool,
  observerPool,
  templates,
  customColumns,
  fillWindow,
  initialKind = 'MEMBER',
  readOnly = false,
}: {
  yearROC: number;
  sessions: AdminSessionDTO[];
  participants: AdminParticipantDTO[];
  memberPool: PoolUser[];
  observerPool: PoolUser[];
  templates: AdminTemplateDTO[];
  customColumns: AdminColumnDTO[];
  fillWindow: {
    openAt: string | null; closeAt: string | null; travelOpenAt: string | null; travelCloseAt: string | null;
    // 圖41:觀察員時窗與委員分開設定
    observerOpenAt: string | null; observerCloseAt: string | null; observerTravelOpenAt: string | null; observerTravelCloseAt: string | null;
    observerReceiptEnabled: boolean;
  } | null; // 該年度雙時窗×二身分 + 領據開關(UAT 圖30/41)
  initialKind?: SurveyParticipantKind; // 側欄「委員/觀察員」直達(page 由 ?kind 帶入)
  readOnly?: boolean; // UAT 圖57:歷年資料唯讀(任何身分不可編修;伺服器端另有硬擋)
}) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<SurveyParticipantKind>(initialKind);
  const [sessionMgrOpen, setSessionMgrOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<AdminParticipantDTO | null>(null);
  const [removeFor, setRemoveFor] = useState<AdminParticipantDTO | null>(null);
  const [reviewFor, setReviewFor] = useState<AdminParticipantDTO | null>(null);
  const [profileFor, setProfileFor] = useState<AdminParticipantDTO | null>(null);
  const [colSettingsFor, setColSettingsFor] = useState<AdminColumnDTO | null>(null);
  const [templateMgrOpen, setTemplateMgrOpen] = useState(false);
  const [fillWindowOpen, setFillWindowOpen] = useState(false);
  const [sortSessionId, setSortSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // UAT 圖6 安全鎖:意願為受調者本人填報結果,中心改格須填「變動原因」解鎖(進稽核軌跡)
  const [unlockCell, setUnlockCell] = useState<{ pid: string; sessionId: string; pName: string; sName: string; next: string } | null>(null);
  const [unlockReason, setUnlockReason] = useState('');

  const rows = useMemo(() => {
    const list = participants.filter((p) => p.kind === kind);
    if (!sortSessionId) return list;
    // 一鍵分組(UAT):依「最終指派該場次」者排前(非委員 OK 意願),穩定排序不改其餘相對序。
    return [...list].sort((a, b) => {
      const av = a.finalSessionIds.includes(sortSessionId) ? 0 : 1;
      const bv = b.finalSessionIds.includes(sortSessionId) ? 0 : 1;
      return av - bv;
    });
  }, [participants, kind, sortSessionId]);

  // D UAT:觀察員分頁不顯示「委員專屬」場次(sharedWithObserver=false,如委員共識會議);委員分頁顯示全部。
  const visibleSessions = useMemo(
    () => (kind === 'OBSERVER' ? sessions.filter((s) => s.sharedWithObserver) : sessions),
    [sessions, kind],
  );

  const targetField = kind === 'OBSERVER' ? 'targetObserverCount' : 'targetMemberCount';
  const colCount = visibleSessions.length + customColumns.length + 8 + (kind === 'MEMBER' ? 2 : 0); // UAT 圖28 移除意願回信;圖36 委員加回傳領據欄;圖51 移除文件交接

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
    const j = await res.json().catch(() => ({ recipientCount: 0, skipped: false }));
    if (j.recipientCount > 0) toast.success(`已寄出催辦（${stage === 2 ? '差旅' : '意願'}）`, p.name);
    else if (j.skipped) toast.warning('今日已催辦過', '24 小時內同一階段僅寄一次，避免重複打擾。');
    else if (stage === 2) toast.warning('未寄送', '該人員尚未被指派最終場次，或帳號已停用。');
    else toast.warning('未寄送', '該帳號已停用或查無收件人。');
  }

  async function addColumn() {
    // UAT 圖58:欄位只建在當前分頁類別(委員/觀察員各自獨立,不再兩邊連動)
    await call('/api/pre-survey/columns', 'POST', { year: yearROC + 1911, title: '新欄位', kind }, '已新增欄位');
  }
  const renameColumn = (id: string, title: string) => call('/api/pre-survey/columns', 'PATCH', { id, title });

  return (
    <div className="space-y-6">
      {/* UAT 圖57:歷年資料唯讀橫幅(伺服器端所有寫入 API 另有硬擋) */}
      {readOnly && (
        <div className="rounded-md border border-warning-300 bg-warning-50 px-4 py-2.5 text-body-sm text-ink-900">
          {yearROC} 年度為歷年資料，僅供檢視與匯出，任何身分皆不可再編修。
        </div>
      )}
      {/* 系統檔案管理區(公版範本 + 個別委員舊版經歷說明書) */}
      <FileManagementCard
        kind={kind}
        templates={templates}
        members={participants.filter((p) => p.kind === 'MEMBER')}
        onManageTemplates={readOnly ? undefined : () => setTemplateMgrOpen(true)}
        receiptEnabled={fillWindow?.observerReceiptEnabled ?? false}
      />

      {/* 工具列 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Segmented
          value={kind}
          onChange={(v) => {
            setKind(v); // 即時切換內容;同步 ?kind 讓側欄樹高亮跟著走(避免側欄停在舊身分)
            const params = new URLSearchParams(window.location.search);
            params.set('kind', v);
            router.replace(`/pre-survey?${params.toString()}`, { scroll: false });
          }}
          options={[
            { value: 'MEMBER', label: '委員' },
            { value: 'OBSERVER', label: '觀察員' },
          ]}
        />
        <div className="flex items-center gap-2 flex-wrap">
          {/* UAT 圖57:歷年唯讀——僅保留匯出;各編修入口整組隱藏 */}
          {!readOnly && (
            <>
              <Button size="sm" variant="outlined" leadingIcon={<Plus size={15} />} onClick={addColumn} disabled={busy}>
                新增欄位
              </Button>
              <Button size="sm" variant="outlined" leadingIcon={<Settings size={15} />} onClick={() => setSessionMgrOpen(true)}>
                管理場次
              </Button>
              <Button size="sm" variant="outlined" leadingIcon={<CalendarDays size={15} />} onClick={() => setFillWindowOpen(true)}>
                填報時間
              </Button>
            </>
          )}
          <Button href={`/api/pre-survey/export?year=${yearROC + 1911}&kind=${kind}`} size="sm" variant="outlined" download>
            匯出 CSV
          </Button>
          {!readOnly && (
            <Button size="sm" leadingIcon={<Plus size={15} />} onClick={() => setAddOpen(true)}>
              新增{kind === 'OBSERVER' ? '觀察員' : '委員'}
            </Button>
          )}
        </div>
      </div>

      {/* 達標儀表卡 */}
      {visibleSessions.length > 0 && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {visibleSessions.map((s) => {
            const target = s[targetField];
            // UAT:分母是「最終指派目標人數」,分子應為「已指派該場次人數」(非意願 OK 人數)
            const assigned = rows.filter((p) => p.finalSessionIds.includes(s.id)).length;
            return (
              <Card key={s.id} variant="outlined" className="!p-3.5">
                <p className="text-caption text-ink-500 truncate">{s.dateLabel} · {s.name}</p>
                <p className="mt-1 text-title-md text-ink-900 tabular-nums">
                  {assigned}<span className="text-body-sm text-ink-500"> / {target} 人</span>
                </p>
                <p className="text-[10px] text-ink-400 leading-tight">已指派 / 目標</p>
                <div className="mt-2 h-1.5 rounded-full bg-paper-sunk overflow-hidden">
                  <div
                    className={`h-full rounded-full ${targetTone(assigned, target) === 'success' ? 'bg-success-500' : 'bg-primary-500'}`}
                    style={{ width: `${target > 0 ? Math.min(100, (assigned / target) * 100) : 0}%` }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 管考矩陣 */}
      <Card variant="outlined" className="!p-0 overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-body-sm border-collapse">
            <thead>
              <tr className="bg-paper-sunk text-caption text-ink-500">
                <th className="sticky left-0 top-0 z-30 bg-paper-sunk px-3 py-2.5 text-left font-medium min-w-[120px]">姓名</th>
                {kind === 'MEMBER' && <th className="sticky top-0 z-20 bg-paper-sunk px-3 py-2.5 text-left font-medium min-w-[124px]">專長</th>}
                <th className="sticky top-0 z-20 bg-paper-sunk px-3 py-2.5 text-left font-medium min-w-[120px]">資料繳交</th>
                {/* 左群組:最終場次(UAT 圖28:意願回信欄已移除——填寫皆於系統內完成,毋須回信) */}
                <th className="sticky top-0 z-20 bg-paper-sunk px-3 py-2.5 text-left font-medium min-w-[180px]">最終場次</th>
                {/* 場次意願(點表頭一鍵分組) */}
                {visibleSessions.map((s, i) => {
                  const active = sortSessionId === s.id;
                  return (
                    <th
                      key={s.id}
                      className={`sticky top-0 z-20 px-2 py-2.5 text-center font-medium min-w-[108px] cursor-pointer select-none hover:text-ink-700 ${active ? 'bg-primary-50 text-primary-700' : 'bg-paper-sunk'}`}
                      title={`${s.dateLabel} ${s.name}（點擊依此場次最終指派分組）`}
                      onClick={() => setSortSessionId(active ? null : s.id)}
                    >
                      <div className="text-ink-700">{s.dateLabel}</div>
                      <div className="text-ink-900 truncate max-w-[104px] inline-flex items-center gap-0.5">
                        {s.name}{active && <ChevronDown size={11} />}
                      </div>
                      <div className="text-[10px] text-ink-500">（場次 {i + 1})</div>
                    </th>
                  );
                })}
                {/* 右群組:回傳領據(委員) / 交通 / 飲食 / 電話 / 備註(UAT 圖51:移除舊 mockup 遺留「文件交接」欄) */}
                {kind === 'MEMBER' && <th className="sticky top-0 z-20 bg-paper-sunk px-3 py-2.5 text-center font-medium">回傳領據</th>}
                <th className="sticky top-0 z-20 bg-paper-sunk px-3 py-2.5 text-left font-medium min-w-[110px]">交通</th>
                <th className="sticky top-0 z-20 bg-paper-sunk px-3 py-2.5 text-left font-medium min-w-[110px]">飲食</th>
                <th className="sticky top-0 z-20 bg-paper-sunk px-3 py-2.5 text-left font-medium min-w-[110px]">聯絡電話</th>
                <th className="sticky top-0 z-20 bg-paper-sunk px-3 py-2.5 text-left font-medium min-w-[130px]">備註</th>
                {/* 自訂欄位(可改名 / 刪除) */}
                {customColumns.map((c) => (
                  <th key={c.id} className="sticky top-0 z-20 bg-paper-sunk px-2 py-2 text-left font-medium min-w-[120px]">
                    <div className="flex items-center gap-1">
                      <input
                        defaultValue={c.title}
                        disabled={readOnly}
                        onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== c.title) renameColumn(c.id, t); else if (!t) e.target.value = c.title; }}
                        className="w-full min-w-[52px] rounded bg-transparent px-1 py-0.5 text-caption font-medium text-ink-700 focus-ring hover:bg-paper"
                        aria-label="自訂欄位標題"
                      />
                      {!readOnly && (
                      <button
                        type="button"
                        onClick={() => setColSettingsFor(c)}
                        className="shrink-0 text-ink-400 hover:text-primary-600 focus-ring rounded"
                        title="欄位設定（開放受調者填寫／到期日）"
                      >
                        <Settings size={13} />
                      </button>
                      )}
                      {!readOnly && (
                      <button
                        type="button"
                        onClick={() => call('/api/pre-survey/columns', 'DELETE', { id: c.id }, '已刪除欄位')}
                        className="shrink-0 text-ink-400 hover:text-danger-600 focus-ring rounded"
                        title="刪除欄位"
                      >
                        <Trash2 size={13} />
                      </button>
                      )}
                    </div>
                    {(c.selfEditable || c.dueDate) && (
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-normal leading-tight text-ink-500">
                        {c.selfEditable && (
                          <span className="inline-flex items-center gap-0.5 text-primary-700"><User size={9} />受調者填</span>
                        )}
                        {c.dueDate && <span>到期 {c.dueDate.slice(5)}</span>}
                      </div>
                    )}
                  </th>
                ))}
                <th className="sticky top-0 z-20 bg-paper-sunk px-3 py-2.5 text-right font-medium min-w-[80px]">動作</th>
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
                        {/* UAT 圖28:「專長」可複選(一位委員可擅長多構面);圖57 歷年唯讀 */}
                        <SpecialtyCell p={p} busy={busy || readOnly} onSave={(next) => patchParticipant(p.id, { committeeTypes: next })} />
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
                        {/* UAT 圖57:歷年唯讀不催辦 */}
                        {!readOnly && (
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
                        )}
                      </div>
                    </td>
                    {/* 最終場次(E UAT:內嵌下拉多選,免點進彈窗直接指派;圖57 歷年唯讀=只列不可編) */}
                    <td className="px-3 py-2">
                      <FinalSessionCell p={p} sessions={visibleSessions} readOnly={readOnly} />
                    </td>
                    {/* 場次意願 */}
                    {visibleSessions.map((s) => (
                      <td key={s.id} className="px-2 py-2 text-center">
                        <Select
                          value={p.availability[s.id] ?? ''}
                          disabled={readOnly}
                          onChange={(e) => {
                            // 安全鎖:不直接寫入,先開「解鎖修改」視窗填變動原因(controlled value 未變,取消即回彈)
                            setUnlockReason('');
                            setUnlockCell({ pid: p.id, sessionId: s.id, pName: p.name, sName: s.name, next: e.target.value || 'NA' });
                          }}
                          dense
                          aria-label={`${p.name} 對 ${s.name} 意願`}
                        >
                          <option value="">未填</option>
                          <option value="OK">{SURVEY_AVAILABILITY_LABELS.OK}</option>
                          <option value="NA">{SURVEY_AVAILABILITY_LABELS.NA}</option>
                        </Select>
                      </td>
                    ))}
                    {/* UAT 圖36:回傳領據(委員;寄信收送,中心手動勾選統計) */}
                    {kind === 'MEMBER' && (
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-rule accent-primary-600"
                          checked={p.receiptReturned}
                          disabled={busy || readOnly}
                          onChange={(e) => patchParticipant(p.id, { receiptReturned: e.target.checked })}
                          aria-label={`${p.name} 是否已回傳領據`}
                        />
                      </td>
                    )}
                    {/* 交通 / 飲食(唯讀;本人填) */}
                    <td className="px-3 py-2 text-caption text-ink-700">
                      {p.transport.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {p.transport.map((t, i) => (
                            <span key={i} className="whitespace-nowrap">{t}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-caption text-ink-700">
                      {p.diet.length > 0 ? p.diet.join('、') : <span className="text-ink-400">—</span>}
                      {p.travelNote && <span className="block text-ink-400" title={p.travelNote}>備註…</span>}
                    </td>
                    {/* 聯絡電話(中心可改;key 綁 p.phone → 個人資料彈窗改電話後 refresh 令此格重掛吃到新值) */}
                    <td className="px-3 py-2">
                      <input
                        key={p.phone ?? ''}
                        defaultValue={p.phone ?? ''}
                        disabled={readOnly}
                        onBlur={(e) => { if ((e.target.value.trim() || null) !== (p.phone ?? null)) patchParticipant(p.id, { phone: e.target.value.trim() || null }); }}
                        placeholder="—"
                        className="w-full min-w-[100px] rounded border border-rule bg-card px-2 py-1 text-caption focus-ring disabled:bg-transparent disabled:border-transparent"
                      />
                    </td>
                    {/* 備註 */}
                    <td className="px-3 py-2">
                      <input
                        defaultValue={p.note ?? ''}
                        disabled={readOnly}
                        onBlur={(e) => { if ((e.target.value.trim() || null) !== (p.note ?? null)) patchParticipant(p.id, { note: e.target.value.trim() || null }); }}
                        placeholder="—"
                        className="w-full min-w-[110px] rounded border border-rule bg-card px-2 py-1 text-caption focus-ring disabled:bg-transparent disabled:border-transparent"
                      />
                    </td>
                    {/* 自訂欄位值 */}
                    {customColumns.map((c) => (
                      <td key={c.id} className="px-2 py-2">
                        <input
                          defaultValue={p.customValues[c.id] ?? ''}
                          disabled={readOnly}
                          onBlur={(e) => { if ((e.target.value.trim()) !== (p.customValues[c.id] ?? '')) setCustomValue(p.id, c.id, e.target.value.trim()); }}
                          placeholder="—"
                          className="w-full min-w-[100px] rounded border border-rule bg-card px-2 py-1 text-caption focus-ring disabled:bg-transparent disabled:border-transparent"
                        />
                      </td>
                    ))}
                    {/* 動作:移除(圖57 歷年唯讀不提供) */}
                    <td className="px-3 py-2">
                      {!readOnly && (
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
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <SessionManagerDialog open={sessionMgrOpen} onOpenChange={setSessionMgrOpen} yearROC={yearROC} sessions={sessions} />
      <FillWindowDialog open={fillWindowOpen} onOpenChange={setFillWindowOpen} yearROC={yearROC} fillWindow={fillWindow} />
      <TemplateManagerDialog
        open={templateMgrOpen}
        onOpenChange={setTemplateMgrOpen}
        yearROC={yearROC}
        templates={templates}
        kind={kind}
        receiptEnabled={fillWindow?.observerReceiptEnabled ?? false}
      />
      <AddParticipantDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        yearROC={yearROC}
        kind={kind}
        pool={kind === 'OBSERVER' ? observerPool : memberPool}
        existingUserIds={new Set(participants.filter((p) => p.kind === kind).map((p) => p.userId))}
      />
      <AssignDialog participant={assignFor} sessions={sessions} onClose={() => setAssignFor(null)} />
      <DocReviewDialog participant={reviewFor} onClose={() => setReviewFor(null)} readOnly={readOnly} />
      <AdminProfileDialog participant={profileFor} sessions={sessions} onClose={() => setProfileFor(null)} readOnly={readOnly} />
      <ColumnSettingsDialog column={colSettingsFor} onClose={() => setColSettingsFor(null)} />
      <ConfirmDialog
        open={removeFor !== null}
        onOpenChange={(o) => { if (!o) setRemoveFor(null); }}
        title="移除受調人員"
        description={removeFor ? `確定將「${removeFor.name}」自本年度調查名單移除？其意願與指派將一併刪除。` : ''}
        confirmLabel="移除"
        tone="danger"
        onConfirm={async () => { if (removeFor) { await call(`/api/pre-survey/participants/${removeFor.id}`, 'DELETE', undefined, '已移除'); setRemoveFor(null); } }}
      />
      {/* UAT 圖6 安全鎖:中心修改意願須填變動原因才解鎖(後端同步強制,原因進稽核軌跡) */}
      <Dialog
        open={unlockCell !== null}
        onOpenChange={(o) => { if (!o && !busy) setUnlockCell(null); }}
        title="解鎖修改意願"
        description="意願為受調者本人填報結果，中心代為修改須留下變動原因（記入稽核軌跡）。"
        footer={
          <>
            <Button variant="text" onClick={() => setUnlockCell(null)} disabled={busy}>取消</Button>
            <Button
              onClick={async () => {
                if (!unlockCell) return;
                if (!unlockReason.trim()) { toast.error('請填寫變動原因'); return; }
                const ok = await call(
                  `/api/pre-survey/participants/${unlockCell.pid}/availability`,
                  'PUT',
                  { sessionId: unlockCell.sessionId, status: unlockCell.next, reason: unlockReason.trim() },
                  '已修改意願',
                );
                if (ok) setUnlockCell(null);
              }}
              loading={busy}
              disabled={busy}
            >
              解鎖並修改
            </Button>
          </>
        }
      >
        {unlockCell && (
          <div className="space-y-3 pt-2">
            <p className="text-body-sm text-ink-900">
              {unlockCell.pName} · {unlockCell.sName}：改為「{unlockCell.next === 'OK' ? SURVEY_AVAILABILITY_LABELS.OK : SURVEY_AVAILABILITY_LABELS.NA}」
            </p>
            <TextField
              label="變動原因（必填）"
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder="如：委員來電告知行程異動"
            />
          </div>
        )}
      </Dialog>
    </div>
  );
}

// ── 系統檔案管理區(公版範本入口 + 個別委員舊版經歷說明書上傳) ──
function FileManagementCard({
  kind, templates, members, onManageTemplates, receiptEnabled,
}: {
  kind: SurveyParticipantKind;
  templates: AdminTemplateDTO[];
  members: AdminParticipantDTO[];
  onManageTemplates?: () => void; // UAT 圖57:歷年唯讀時不提供(隱藏管理/上傳,僅留下載)
  receiptEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  // UAT 圖40:觀察員領據槽為年度開關制——未開放年度不計入分母(顯示 1/1 而非 1/2)
  const kindSlots = (SURVEY_TEMPLATE_SLOTS_BY_KIND[kind] as readonly string[]).filter(
    (s) => s !== 'RECEIPT_OBSERVER' || receiptEnabled,
  );
  const uploadedCount = templates.filter((t) => t.fileId && kindSlots.includes(t.slot)).length;
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
          <p className="text-body-sm font-medium text-ink-900">公版空白範本（{kind === 'OBSERVER' ? '觀察員' : '委員'}）</p>
          <p className="mt-1 text-caption text-ink-500">
            {kind === 'OBSERVER' ? '觀察員專用的空白保密切結書' : '委員通用的空白保密切結書與經歷說明書'}等。目前已上傳 {uploadedCount} / {kindSlots.length} 槽。
          </p>
          {onManageTemplates && (
            <div className="mt-3">
              <Button size="sm" variant="outlined" leadingIcon={<Paperclip size={14} />} onClick={onManageTemplates}>
                管理公版範本
              </Button>
            </div>
          )}
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
              {onManageTemplates && <FileUploadButton size="sm" label="上傳" busy={busy} onChange={uploadPriorCv} />}
            </div>
            {selected?.priorCvFile && (
              <p className="mt-2 text-caption text-ink-600 break-all">
                現有：
                <a href={`/api/pre-survey/files/${selected.priorCvFile.id}/download`} className="ml-1 text-primary-700 hover:underline">
                  {selected.priorCvFile.name}
                </a>
                {onManageTemplates && (
                  <button type="button" onClick={removePriorCv} className="ml-2 text-danger-600 hover:underline focus-ring rounded">刪除</button>
                )}
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
  participant, sessions, onClose, readOnly = false,
}: { participant: AdminParticipantDTO | null; sessions: AdminSessionDTO[]; onClose: () => void; readOnly?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [phone2, setPhone2] = useState('');
  const [email2, setEmail2] = useState('');
  const [proxyName, setProxyName] = useState('');
  const [proxyEmail, setProxyEmail] = useState('');
  const [proxyPhone, setProxyPhone] = useState('');
  const [saving, setSaving] = useState(false);
  // UAT 圖24:聯絡欄安全鎖(填變動原因才可儲存)
  const [contactReasonOpen, setContactReasonOpen] = useState(false);
  const [contactReason, setContactReason] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    setPhone(participant?.phone ?? '');
    setEmail(participant?.email ?? '');
    setPhone2(participant?.phone2 ?? '');
    setEmail2(participant?.email2 ?? '');
    setProxyName(participant?.proxyName ?? '');
    setProxyEmail(participant?.proxyEmail ?? '');
    setProxyPhone(participant?.proxyPhone ?? '');
    setReviewReason(participant?.rejectReason ?? '');
  }, [participant]);

  if (!participant) return null;
  const p = participant;
  const isObserver = p.kind === 'OBSERVER';
  const assignedNames = sessions.filter((s) => p.finalSessionIds.includes(s.id)).map((s) => `${s.dateLabel} ${s.name}`);

  // UAT 圖24 安全鎖:聯絡資訊為受調者本人填報結果,中心代改須填變動原因(後端同步強制、進稽核軌跡)
  async function saveContact() {
    if (!contactReason.trim()) { toast.error('請填寫變動原因'); return; }
    setSaving(true);
    const res = await fetch(`/api/pre-survey/participants/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: phone.trim() || null,
        email: email.trim() || null,
        phone2: phone2.trim() || null,
        email2: email2.trim() || null,
        proxyName: proxyName.trim() || null,
        proxyEmail: proxyEmail.trim() || null,
        proxyPhone: proxyPhone.trim() || null,
        reason: contactReason.trim(),
      }),
    });
    setSaving(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '儲存失敗' })); toast.error('儲存失敗', j.error); return; }
    toast.success('已儲存聯絡資訊');
    setContactReasonOpen(false);
    setContactReason('');
    router.refresh();
  }

  // G UAT:個人資料彈窗也能審核文件(核可/退補);與管考表「資料繳交」欄的 DocReviewDialog 同一後端閘。
  async function review(decision: 'APPROVE' | 'RETURN') {
    if (decision === 'RETURN' && !reviewReason.trim()) { toast.error('退補必須填寫理由'); return; }
    setReviewing(true);
    const res = await fetch(`/api/pre-survey/participants/${p.id}/docs/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision, reason: reviewReason.trim() || undefined }),
    });
    setReviewing(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '審核失敗' })); toast.error('審核失敗', j.error); return; }
    toast.success(decision === 'APPROVE' ? '文件已核可' : '已退補，將通知受調者補件');
    onClose(); // 關窗 + refresh 使管考表狀態同步(彈窗持舊 DTO,不重掛)
    router.refresh();
  }

  // UAT:中心對此人「開放補填/變更(一階=意願/文件/聯絡)」開關(逾第一時窗仍可編修;供逾期補填或申請變更)
  async function toggleUnlock() {
    setUnlocking(true);
    const res = await fetch(`/api/pre-survey/participants/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ editUnlocked: !p.editUnlocked }),
    });
    setUnlocking(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '設定失敗' })); toast.error('設定失敗', j.error); return; }
    toast.success(!p.editUnlocked ? '已開放此人補填/變更意願與文件' : '已關閉此人一階補填權限');
    onClose(); // 關窗 + refresh 使狀態同步(彈窗持舊 DTO,不重掛)
    router.refresh();
  }

  // UAT 圖55:二階(差旅/飲食)補填開放獨立開關——只開差旅,不連動一階
  async function toggleTravelUnlock() {
    setUnlocking(true);
    const res = await fetch(`/api/pre-survey/participants/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ travelEditUnlocked: !p.travelEditUnlocked }),
    });
    setUnlocking(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '設定失敗' })); toast.error('設定失敗', j.error); return; }
    toast.success(!p.travelEditUnlocked ? '已開放此人補填差旅與飲食' : '已關閉此人二階補填權限');
    onClose();
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
          <Chip size="sm" tone="neutral">{isObserver ? '觀察員' : parseSpecialties(p.committeeType).join('、') || '委員'}</Chip>
          <Chip size="sm" tone={docDisp.tone}>{docDisp.label}</Chip>
        </span>
      }
    >
      <div className="space-y-5">
        {/* 聯絡資訊(圖57 歷年唯讀:欄位鎖定、不提供儲存) */}
        <section>
          <h4 className="text-label text-ink-900 mb-2">聯絡資訊</h4>
          <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-2">
            <TextField label="電子郵件（主要）" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField label="聯絡電話（主要）" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <TextField label="電子郵件（次要）" value={email2} onChange={(e) => setEmail2(e.target.value)} placeholder="—" />
            <TextField label="聯絡電話（次要）" value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="—" />
            <TextField label="代理人姓名/職稱" value={proxyName} onChange={(e) => setProxyName(e.target.value)} placeholder="如：王小明/秘書" />
            <TextField label="代理聯絡人信箱" value={proxyEmail} onChange={(e) => setProxyEmail(e.target.value)} placeholder="無代理則留空" />
            <TextField label="代理聯絡人電話" value={proxyPhone} onChange={(e) => setProxyPhone(e.target.value)} placeholder="無代理則留空" />
          </fieldset>
          <div className="mt-2">
            {readOnly ? null : contactReasonOpen ? (
              <div className="w-full space-y-2 rounded-md border border-rule bg-paper-sunk/50 p-3">
                <TextField
                  label="變動原因（必填，記入稽核軌跡）"
                  value={contactReason}
                  onChange={(e) => setContactReason(e.target.value)}
                  placeholder="如：委員來電告知更換聯絡方式"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={saveContact} loading={saving} disabled={saving}>解鎖並儲存</Button>
                  <Button size="sm" variant="text" onClick={() => setContactReasonOpen(false)} disabled={saving}>取消</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="tonal" onClick={() => { setContactReason(''); setContactReasonOpen(true); }}>儲存聯絡資訊</Button>
            )}
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
          {/* G UAT:已送審 → 中心可於此直接核可/退補(免另尋管考表「資料繳交」欄);圖57 歷年唯讀不提供 */}
          {!readOnly && p.docStatus === 'SUBMITTED' && (
            <div className="mt-3 rounded-md border border-rule bg-paper-sunk/40 p-3">
              <p className="text-caption text-ink-600 mb-2">
                {p.docReviewed ? '文件已核可；如需重審可退補。' : '受調者已送審文件，請審核：'}
              </p>
              <Textarea label="退補理由（退補時必填）" value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} rows={2} />
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => review('APPROVE')} loading={reviewing} disabled={reviewing}>核可</Button>
                <Button size="sm" variant="danger" onClick={() => review('RETURN')} loading={reviewing} disabled={reviewing}>退補</Button>
              </div>
            </div>
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
          {/* UAT 圖55:一階(意願/文件/聯絡)補填開關——與二階差旅開關分離,各開各的;圖57 歷年唯讀不提供 */}
          {!readOnly && (
          <div className="mt-2.5 flex items-center justify-between gap-3 rounded-md bg-paper-sunk/50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-caption font-medium text-ink-700">開放補填／變更（意願與文件）</p>
              {/* UAT 圖52:開放為一次性——補填完成(意願+文件皆送出)即自動收回,不會無限期可改 */}
              <p className="text-caption text-ink-500">
                {p.editUnlocked
                  ? '已開放：此人可無視第一階段時窗編修並重新送出；意願與文件皆送出後自動收回開放。'
                  : '逾填報時窗後此人不可再改；開放後可補填或變更意願與文件（補填送出即自動收回）。'}
              </p>
            </div>
            <Button size="sm" variant={p.editUnlocked ? 'danger' : 'tonal'} onClick={toggleUnlock} loading={unlocking} disabled={unlocking}>
              {p.editUnlocked ? '關閉補填' : '開放補填'}
            </Button>
          </div>
          )}
        </section>

        {/* 差旅與飲食(本人填,唯讀;UAT 圖47:逐場次逐行,一眼可讀) */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-label text-ink-900">差旅與飲食（第二階段）</h4>
            {/* UAT 圖54/55:二階補填為獨立開關——只開差旅/飲食,不連動一階;填齊自動收回;圖57 歷年唯讀不提供 */}
            {!readOnly && (
              <Button
                size="sm"
                variant={p.travelEditUnlocked ? 'danger' : 'text'}
                onClick={toggleTravelUnlock}
                loading={unlocking}
                disabled={unlocking}
              >
                {p.travelEditUnlocked ? '關閉補填' : '開放補填'}
              </Button>
            )}
          </div>
          {!readOnly && p.travelEditUnlocked && (
            <p className="mb-2 text-caption text-ink-500">已開放：此人可無視第二階段時窗補填差旅與飲食；填齊後自動收回開放。</p>
          )}
          <div className="space-y-1 text-caption text-ink-700">
            {p.transport.length > 0 ? (
              p.transport.map((t, i) => <p key={i}>{t}</p>)
            ) : (
              <p><span className="text-ink-500">交通：</span>—</p>
            )}
            <p><span className="text-ink-500">飲食：</span>{p.diet.length > 0 ? p.diet.join('、') : '—'}</p>
            {p.travelNote && <p><span className="text-ink-500">差旅備註：</span>{p.travelNote}</p>}
          </div>
        </section>
      </div>
    </Dialog>
  );
}

// ── 自訂欄位設定對話框(#5:開放受調者填寫 + 填報到期日) ──
function ColumnSettingsDialog({ column, onClose }: { column: AdminColumnDTO | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [selfEditable, setSelfEditable] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelfEditable(column?.selfEditable ?? false);
    setDueDate(column?.dueDate ?? '');
  }, [column]);

  if (!column) return null;

  async function save() {
    setSaving(true);
    const res = await fetch('/api/pre-survey/columns', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      // 未開放受調者填寫時,到期日一併清除(避免殘留誤導 timer 設定判讀)
      body: JSON.stringify({ id: column!.id, selfEditable, dueDate: selfEditable ? (dueDate || null) : null }),
    });
    setSaving(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '儲存失敗' })); toast.error('儲存失敗', j.error); return; }
    toast.success('已更新欄位設定');
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={column !== null}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={`欄位設定：${column.title}`}
      description="可開放受調者於自助頁自行填寫，並設定填報到期日；逾期未填，系統排程將自動催辦受調者本人。"
      footer={<><Button variant="text" onClick={onClose}>取消</Button><Button onClick={save} loading={saving} disabled={saving}>儲存</Button></>}
    >
      <div className="space-y-4 pt-2">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={selfEditable}
            onChange={(e) => setSelfEditable(e.target.checked)}
            className="mt-0.5 rounded border-rule"
          />
          <span>
            <span className="block text-body-sm font-medium text-ink-900">由受調者自行填寫</span>
            <span className="block text-caption text-ink-500">
              開啟後，此欄位會出現在委員/觀察員的自助頁供其填寫；關閉則僅中心於管考表填寫（受調者看不到）。
            </span>
          </span>
        </label>
        <div>
          <TextField
            label="填報到期日（選填）"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={!selfEditable}
          />
          <p className="mt-1 text-caption text-ink-500">
            {selfEditable
              ? '設定後，對到期仍未填寫的受調者，系統每日排程將自動寄信＋站內催辦本人（到期前 7 日內一次、逾期每 7 天一次）。留空＝不催辦。'
              : '需先開啟「由受調者自行填寫」才能設定到期日。'}
          </p>
        </div>
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
/** ISO(UTC)→ datetime-local input 值,固定以台北時區呈現(不隨管理員瀏覽器時區偏移);null/空/無效回 ''。 */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) if (p.type !== 'literal') o[p.type] = p.value;
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}

// ── 意願填報時窗設定(中心設定 openAt/closeAt;逾窗受調者鎖定,除非個別開放補填) ──
/** 圖41:單一時間區間(起訖兩個 datetime-local)的共用輸入組 */
function WindowRangeFields({
  title, openVal, closeVal, onOpenChange, onCloseChange,
}: {
  title: string;
  openVal: string;
  closeVal: string;
  onOpenChange: (v: string) => void;
  onCloseChange: (v: string) => void;
}) {
  return (
    <div className="rounded-md border border-rule bg-card p-3.5 space-y-3">
      <p className="text-label text-ink-900">{title}</p>
      <div>
        <label className="block text-caption text-ink-600 mb-1">開放起始（留空=即刻起）</label>
        <input
          type="datetime-local"
          value={openVal}
          onChange={(e) => onOpenChange(e.target.value)}
          className="w-full rounded-md border border-rule bg-card px-3 py-2 text-body-sm focus-ring"
        />
      </div>
      <div>
        <label className="block text-caption text-ink-600 mb-1">截止（留空=不限）</label>
        <input
          type="datetime-local"
          value={closeVal}
          onChange={(e) => onCloseChange(e.target.value)}
          className="w-full rounded-md border border-rule bg-card px-3 py-2 text-body-sm focus-ring"
        />
      </div>
    </div>
  );
}

function FillWindowDialog({
  open, onOpenChange, yearROC, fillWindow,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  yearROC: number;
  fillWindow: {
    openAt: string | null; closeAt: string | null; travelOpenAt: string | null; travelCloseAt: string | null;
    observerOpenAt: string | null; observerCloseAt: string | null; observerTravelOpenAt: string | null; observerTravelCloseAt: string | null;
  } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  // 圖41:委員與觀察員時窗分開設定(各自兩個區間,共 8 端)
  const [openAt, setOpenAt] = useState('');
  const [closeAt, setCloseAt] = useState('');
  const [travelOpenAt, setTravelOpenAt] = useState('');
  const [travelCloseAt, setTravelCloseAt] = useState('');
  const [obsOpenAt, setObsOpenAt] = useState('');
  const [obsCloseAt, setObsCloseAt] = useState('');
  const [obsTravelOpenAt, setObsTravelOpenAt] = useState('');
  const [obsTravelCloseAt, setObsTravelCloseAt] = useState('');
  const [busy, setBusy] = useState(false);

  // 每次開啟以最新 prop 重置(避免關窗後再開仍顯舊值)
  useEffect(() => {
    if (open) {
      setOpenAt(isoToLocalInput(fillWindow?.openAt ?? null));
      setCloseAt(isoToLocalInput(fillWindow?.closeAt ?? null));
      setTravelOpenAt(isoToLocalInput(fillWindow?.travelOpenAt ?? null));
      setTravelCloseAt(isoToLocalInput(fillWindow?.travelCloseAt ?? null));
      setObsOpenAt(isoToLocalInput(fillWindow?.observerOpenAt ?? null));
      setObsCloseAt(isoToLocalInput(fillWindow?.observerCloseAt ?? null));
      setObsTravelOpenAt(isoToLocalInput(fillWindow?.observerTravelOpenAt ?? null));
      setObsTravelCloseAt(isoToLocalInput(fillWindow?.observerTravelCloseAt ?? null));
    }
  }, [
    open,
    fillWindow?.openAt, fillWindow?.closeAt, fillWindow?.travelOpenAt, fillWindow?.travelCloseAt,
    fillWindow?.observerOpenAt, fillWindow?.observerCloseAt, fillWindow?.observerTravelOpenAt, fillWindow?.observerTravelCloseAt,
  ]);

  async function save() {
    // datetime-local 一律解讀為台北時間(+08:00),不隨管理員瀏覽器時區偏移;空=null(該端不限)
    const toIso = (v: string) => (v ? new Date(`${v.slice(0, 16)}:00+08:00`).toISOString() : null);
    const openIso = toIso(openAt);
    const closeIso = toIso(closeAt);
    const travelOpenIso = toIso(travelOpenAt);
    const travelCloseIso = toIso(travelCloseAt);
    const obsOpenIso = toIso(obsOpenAt);
    const obsCloseIso = toIso(obsCloseAt);
    const obsTravelOpenIso = toIso(obsTravelOpenAt);
    const obsTravelCloseIso = toIso(obsTravelCloseAt);
    const ranges: [string | null, string | null, string][] = [
      [openIso, closeIso, '委員第一區間起始時間不得晚於截止時間'],
      [travelOpenIso, travelCloseIso, '委員第二區間起始時間不得晚於截止時間'],
      [obsOpenIso, obsCloseIso, '觀察員第一區間起始時間不得晚於截止時間'],
      [obsTravelOpenIso, obsTravelCloseIso, '觀察員第二區間起始時間不得晚於截止時間'],
    ];
    for (const [o, c, msg] of ranges) {
      if (o && c && new Date(o) > new Date(c)) { toast.error(msg); return; }
    }
    setBusy(true);
    const res = await fetch('/api/pre-survey/fill-window', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        year: yearROC + 1911,
        openAt: openIso,
        closeAt: closeIso,
        travelOpenAt: travelOpenIso,
        travelCloseAt: travelCloseIso,
        observerOpenAt: obsOpenIso,
        observerCloseAt: obsCloseIso,
        observerTravelOpenAt: obsTravelOpenIso,
        observerTravelCloseAt: obsTravelCloseIso,
      }),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '儲存失敗' })); toast.error('儲存失敗', j.error); return; }
    toast.success('已更新填報時間');
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${yearROC} 年度填報時間`}
      description="委員與觀察員的填報時間分開設定，各有兩個區間：場次意願與文件上傳共用第一區間；場次確定後才開放的差旅（交通住宿／飲食）調查用第二區間。逾期後受調者不可再變更（中心代填不受限，亦可於個別受調者的個人資料開放補填）。留空=該端不限。"
    >
      <div className="space-y-4 pt-2">
        <div className="space-y-3">
          <p className="text-label font-medium text-ink-900">稽核委員填報時間</p>
          <WindowRangeFields title="第一區間：場次意願與文件上傳" openVal={openAt} closeVal={closeAt} onOpenChange={setOpenAt} onCloseChange={setCloseAt} />
          <WindowRangeFields title="第二區間：差旅（交通住宿／飲食）調查" openVal={travelOpenAt} closeVal={travelCloseAt} onOpenChange={setTravelOpenAt} onCloseChange={setTravelCloseAt} />
        </div>
        <div className="space-y-3 border-t border-rule pt-4">
          <p className="text-label font-medium text-ink-900">觀察員填報時間</p>
          <WindowRangeFields title="第一區間：場次意願與文件上傳" openVal={obsOpenAt} closeVal={obsCloseAt} onOpenChange={setObsOpenAt} onCloseChange={setObsCloseAt} />
          <WindowRangeFields title="第二區間：差旅（交通住宿／飲食）調查" openVal={obsTravelOpenAt} closeVal={obsTravelCloseAt} onOpenChange={setObsTravelOpenAt} onCloseChange={setObsTravelCloseAt} />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={save} loading={busy} disabled={busy}>儲存</Button>
          <Button
            size="sm"
            variant="text"
            onClick={() => {
              setOpenAt(''); setCloseAt(''); setTravelOpenAt(''); setTravelCloseAt('');
              setObsOpenAt(''); setObsCloseAt(''); setObsTravelOpenAt(''); setObsTravelCloseAt('');
            }}
            disabled={busy}
          >清除限制</Button>
        </div>
      </div>
    </Dialog>
  );
}

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
  const [anonM, setAnonM] = useState(true);
  const [anonO, setAnonO] = useState(true);
  const [shared, setShared] = useState(true);
  const [needsTravel, setNeedsTravel] = useState(true); // UAT 圖14:線上場次可關(免差旅二階)
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [creatingBriefing, setCreatingBriefing] = useState(false);
  // UAT 圖4:新增場次表單預設收合(彈窗以管理既有場次為主),點標題列展開
  const [showAdd, setShowAdd] = useState(false);

  // B UAT:一鍵把該年度已排定實地稽核日的稽核週期建成場次(去重;與手動新增並存)
  async function importCycles() {
    setImporting(true);
    const res = await fetch('/api/pre-survey/sessions/import-cycles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ year }),
    });
    setImporting(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '帶入失敗' })); toast.error('帶入失敗', j.error); return; }
    const j = await res.json().catch(() => ({ created: 0, skipped: 0 }));
    // UAT 圖37:帶入同時回報補標與週期連動結果(補標後既有指派自動連動,不需重存)
    const extra: string[] = [];
    if (j.skipped > 0) extra.push(`${j.skipped} 個場次已存在略過`);
    if (j.backfilled > 0) extra.push(`補上 ${j.backfilled} 個場次的來源週期`);
    if (j.linkedCycles?.length) extra.push(`已連動加入稽核週期：${j.linkedCycles.join('、')}`);
    if (j.skippedCoi?.length) extra.push(`因服務該機關跳過：${j.skippedCoi.join('、')}`);
    if (j.skippedOther?.length) extra.push(`部分未連動：${j.skippedOther.join('、')}`);
    if (j.observerHint) extra.push('觀察員已入配對，請至週期進階設定指定指導委員');
    if (j.created > 0) toast.success(`已帶入 ${j.created} 個稽核場次`, extra.join('；') || undefined);
    else if (j.backfilled > 0) toast.success('已補齊既有場次的來源週期', extra.join('；') || undefined);
    else toast.warning('無新場次可帶入', j.message ?? (extra.join('；') || undefined));
    router.refresh();
  }

  async function add() {
    if (!name.trim()) { toast.error('請填寫場次名稱/地點'); return; }
    setBusy(true);
    const res = await fetch('/api/pre-survey/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ year, name: name.trim(), date: date || null, isRequired: required, remark: remark.trim() || undefined, targetMemberCount: Number(tm) || 0, targetObserverCount: Number(to) || 0, anonymizeForMember: anonM, anonymizeForObserver: anonO, sharedWithObserver: shared, needsTravel }),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '新增失敗' })); toast.error('新增失敗', j.error); return; }
    setName(''); setDate(''); setRemark(''); setRequired(false); setAnonM(true); setAnonO(true); setShared(true); setNeedsTravel(true);
    toast.success('已新增場次');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`管理 ${yearROC} 年度場次`} description="新增或就地編輯稽核場次；地點預設對受調者以序號匿名（可逐場次關閉）；目標人數為達標儀表卡分母。">
      <div className="space-y-4 pt-2">
        {/* B UAT:帶入當年度稽核場次 */}
        <div className="rounded-md border border-primary-100 bg-primary-50/40 p-3.5">
          <p className="text-body-sm font-medium text-ink-900">帶入當年度稽核場次</p>
          <p className="mt-0.5 text-caption text-ink-500">將本年度已排定實地稽核日的稽核週期一鍵建成場次（日期＝實地稽核日、名稱＝受稽機關；已存在者略過）。仍可於下方手動新增。</p>
          <div className="mt-2">
            <Button size="sm" variant="outlined" onClick={importCycles} loading={importing} disabled={importing}>帶入當年度稽核場次</Button>
          </div>
        </div>
        {/* UAT 圖14:受稽機關說明會=年度必備場次(綁死不可刪;名稱/時間可編);未建立時提供一鍵建立 */}
        {!sessions.some((s) => s.isBriefing) && (
          <div className="rounded-md border border-warning-200 bg-warning-50/50 p-3.5">
            <p className="text-body-sm font-medium text-ink-900">受稽機關說明會（年度必備）尚未建立</p>
            <p className="mt-0.5 text-caption text-ink-500">每年度固定辦理一場說明會；建立後名稱與時間可編輯，但場次不可刪除。預設為線上辦理（不需差旅調查）。</p>
            <div className="mt-2">
              <Button
                size="sm"
                variant="outlined"
                loading={creatingBriefing}
                disabled={creatingBriefing}
                onClick={async () => {
                  setCreatingBriefing(true);
                  const ok = await fetch('/api/pre-survey/sessions', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ year, name: '受稽機關說明會', isBriefing: true, needsTravel: false, anonymizeForMember: false, anonymizeForObserver: false }),
                  }).then((r) => r.ok).catch(() => false);
                  setCreatingBriefing(false);
                  if (ok) { toast.success('已建立受稽機關說明會場次'); router.refresh(); }
                  else toast.error('建立失敗');
                }}
              >
                建立說明會場次
              </Button>
            </div>
          </div>
        )}
        <div className="rounded-md border border-rule bg-card p-3.5">
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            aria-expanded={showAdd}
            className="flex w-full items-center justify-between text-left focus-ring rounded"
          >
            <span className="text-label text-ink-900">新增場次</span>
            <span className="text-caption text-primary-700">{showAdd ? '收合' : '＋ 展開'}</span>
          </button>
          {showAdd && (<>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <TextField label="場次名稱/地點" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：總院、斗六" />
            <TextField label="日期" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <TextField label="目標委員數" type="number" value={tm} onChange={(e) => setTm(e.target.value)} />
            <TextField label="目標觀察員數" type="number" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="mt-3">
            {/* UAT 圖42:備註改多行,長內容一次看全 */}
            <Textarea
              label="備註（受調者可見，勿含地點）"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              placeholder="如：請至少勾選 2 場、上午 09:30 簽到"
            />
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
            <label className="flex items-center gap-2 text-body-sm text-ink-700">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="rounded border-rule" /> 必參加
            </label>
            <label className="flex items-center gap-2 text-body-sm text-ink-700">
              <input type="checkbox" checked={anonM} onChange={(e) => setAnonM(e.target.checked)} className="rounded border-rule" /> 對委員匿名地點
            </label>
            <label className="flex items-center gap-2 text-body-sm text-ink-700">
              <input type="checkbox" checked={anonO} onChange={(e) => setAnonO(e.target.checked)} className="rounded border-rule" /> 對觀察員匿名地點
            </label>
            <label className="flex items-center gap-2 text-body-sm text-ink-700">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="rounded border-rule" /> 委員與觀察員共同場次
            </label>
            <label className="flex items-center gap-2 text-body-sm text-ink-700">
              <input type="checkbox" checked={needsTravel} onChange={(e) => setNeedsTravel(e.target.checked)} className="rounded border-rule" /> 需第二階段差旅調查
            </label>
          </div>
          <p className="mt-1 text-caption text-ink-500">關閉匿名的場次（如委員共識會議），該身分的受調者自助頁會直接看到真實地點名稱；取消「共同場次」則此場次為委員專屬，觀察員不列入調查；線上辦理的場次可取消「差旅調查」，受調者第二階段免填該場次交通住宿。</p>
          <div className="mt-3">
            <Button size="sm" onClick={add} loading={busy} disabled={busy}>新增場次</Button>
          </div>
          </>)}
        </div>

        {sessions.length > 0 && (
          <div className="space-y-3">
            <p className="text-label text-ink-500">既有場次（可直接修改，免刪除重建）</p>
            {sessions.map((s) => <SessionEditRow key={s.id} s={s} />)}
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ── 單一場次就地編輯列(#3 UAT:日期/名稱/目標人數/匿名等直接改,免刪除重建) ──
function SessionEditRow({ s }: { s: AdminSessionDTO }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(s.name);
  const [date, setDate] = useState(s.dateInput ?? '');
  const [tm, setTm] = useState(String(s.targetMemberCount));
  const [to, setTo] = useState(String(s.targetObserverCount));
  const [required, setRequired] = useState(s.isRequired);
  const [remark, setRemark] = useState(s.remark ?? '');
  const [anonM, setAnonM] = useState(s.anonymizeForMember);
  const [anonO, setAnonO] = useState(s.anonymizeForObserver);
  const [shared, setShared] = useState(s.sharedWithObserver);
  const [needsTravel, setNeedsTravel] = useState(s.needsTravel);
  const [busy, setBusy] = useState(false);

  const dirty =
    name.trim() !== s.name ||
    (date || null) !== (s.dateInput ?? null) ||
    (Number(tm) || 0) !== s.targetMemberCount ||
    (Number(to) || 0) !== s.targetObserverCount ||
    required !== s.isRequired ||
    (remark.trim() || '') !== (s.remark ?? '') ||
    anonM !== s.anonymizeForMember ||
    anonO !== s.anonymizeForObserver ||
    shared !== s.sharedWithObserver ||
    needsTravel !== s.needsTravel;

  async function save() {
    if (!name.trim()) { toast.error('請填寫場次名稱/地點'); return; }
    setBusy(true);
    const res = await fetch(`/api/pre-survey/sessions/${s.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        // UAT 圖13:帶入場次的日期鎖定(不送 date;後端亦硬擋),僅隨來源週期實地稽核日連動
        name: name.trim(), ...(s.sourceCycleId ? {} : { date: date || null }), isRequired: required, remark: remark.trim() || null,
        targetMemberCount: Number(tm) || 0, targetObserverCount: Number(to) || 0,
        anonymizeForMember: anonM, anonymizeForObserver: anonO, sharedWithObserver: shared,
        needsTravel,
      }),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '儲存失敗' })); toast.error('儲存失敗', j.error); return; }
    toast.success('已更新場次');
    router.refresh();
  }
  async function del() {
    if (!window.confirm(`確定刪除場次「${s.dateLabel} ${s.name}」？其意願與指派將一併刪除。`)) return;
    const res = await fetch(`/api/pre-survey/sessions/${s.id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '刪除失敗' })); toast.error('刪除失敗', j.error); return; }
    toast.success('已刪除場次');
    router.refresh();
  }

  return (
    <div className="rounded-md border border-rule bg-card p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="場次名稱/地點" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="日期"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={!!s.sourceCycleId}
          helperText={s.sourceCycleId ? '由稽核週期帶入：日期鎖定，請至該週期修改「實地稽核日期」自動連動' : undefined}
        />
        <TextField label="目標委員數" type="number" value={tm} onChange={(e) => setTm(e.target.value)} />
        <TextField label="目標觀察員數" type="number" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="mt-3">
        {/* UAT 圖42:備註改多行,長內容一次看全 */}
        <Textarea label="備註（受調者可見，勿含地點）" value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} />
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
        <label className="flex items-center gap-2 text-body-sm text-ink-700">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="rounded border-rule" /> 必參加
        </label>
        <label className="flex items-center gap-2 text-body-sm text-ink-700">
          <input type="checkbox" checked={anonM} onChange={(e) => setAnonM(e.target.checked)} className="rounded border-rule" /> 對委員匿名地點
        </label>
        <label className="flex items-center gap-2 text-body-sm text-ink-700">
          <input type="checkbox" checked={anonO} onChange={(e) => setAnonO(e.target.checked)} className="rounded border-rule" /> 對觀察員匿名地點
        </label>
        <label className="flex items-center gap-2 text-body-sm text-ink-700">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="rounded border-rule" /> 委員與觀察員共同場次
        </label>
        <label className="flex items-center gap-2 text-body-sm text-ink-700">
          <input type="checkbox" checked={needsTravel} onChange={(e) => setNeedsTravel(e.target.checked)} className="rounded border-rule" /> 需第二階段差旅調查
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={save} loading={busy} disabled={busy || !dirty}>儲存變更</Button>
        {!dirty && <span className="text-caption text-ink-400">尚未修改</span>}
        {s.isBriefing ? (
          <span className="ml-auto text-caption text-ink-500">說明會（年度必備，不可刪除）</span>
        ) : (
          <button type="button" onClick={del} className="ml-auto text-caption text-danger-600 hover:underline focus-ring rounded">刪除場次</button>
        )}
      </div>
    </div>
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

// ── E UAT:管考表「最終場次」內嵌下拉多選(顯示已指派 + 直接勾選指派,免點進彈窗) ──
// 用 fixed 定位讓下拉逃出管考矩陣的 overflow-auto 內捲容器(否則會被裁切)。
/** UAT 圖38:構面 chip 配色(方便辨識;未知構面 fallback neutral)。 */
const ASPECT_CHIP_TONE: Record<string, 'primary' | 'warning' | 'success' | 'sage'> = {
  管理面: 'primary',
  策略面: 'warning',
  技術面: 'success',
  '管理面-OT': 'sage',
};

/** UAT 圖28:解析「專長」欄(JSON 陣列;舊單值字串相容為單元素)。 */
function parseSpecialties(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [raw];
  } catch {
    return [raw];
  }
}

/** UAT 圖28:「專長」欄(可複選;即勾即存)。 */
function SpecialtyCell({ p, busy, onSave }: { p: AdminParticipantDTO; busy: boolean; onSave: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const selected = parseSpecialties(p.committeeType);

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    // UAT 圖62:選單高度可達 320px——夾進視窗內,列在下方時往上收,避免被視窗下緣裁切
    if (r) setPos({ top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 328)), left: r.left });
    setOpen(true);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="inline-flex items-center gap-1 text-left text-caption text-ink-700 hover:underline focus-ring rounded"
        title="設定專長（可複選）"
      >
        <span>{selected.length > 0 ? selected.join('、') : '未分類'}</span>
        <ChevronDown size={12} className="shrink-0" />
      </button>
      {open && pos && (
        <>
          <button type="button" aria-hidden className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="fixed z-50 min-w-[160px] rounded-md border border-rule bg-card p-1 shadow-lg" style={{ top: pos.top, left: pos.left }}>
            {SURVEY_COMMITTEE_TYPES.map((t) => {
              const on = selected.includes(t);
              return (
                <label key={t} className="flex items-center gap-2 rounded px-2 py-1.5 text-caption text-ink-700 hover:bg-paper-sunk cursor-pointer">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={busy}
                    onChange={() => onSave(on ? selected.filter((x) => x !== t) : [...selected, t])}
                    className="rounded border-rule"
                  />
                  {t}
                </label>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function FinalSessionCell({ p, sessions, readOnly = false }: { p: AdminParticipantDTO; sessions: AdminSessionDTO[]; readOnly?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // UAT 圖28:草稿(sessionId→構面;null=免構面)——開啟時自 props 初始化,「儲存指派」才整組送出
  const [draft, setDraft] = useState<Record<string, string | null>>({});

  // 可指派場次=勾「OK」∪ 已指派 ∪ 說明會(年度必備、必參加,不受意願過濾)
  const options = sessions.filter(
    (s) => s.isBriefing || p.availability[s.id] === 'OK' || p.finalSessionIds.includes(s.id),
  );
  const assigned = sessions.filter((s) => p.finalSessionIds.includes(s.id));
  // UAT 圖43:觀察員與委員同款——皆勾選場次並指定構面(觀察員練習聚焦構面);僅說明會免構面
  const needAspect = (s: AdminSessionDTO) => !s.isBriefing;

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    // UAT 圖62:選單 max-h-80(320px)——夾進視窗內,底部列開啟時往上收,委員多時不再被裁切
    if (r) setPos({ top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 328)), left: r.left });
    setDraft(Object.fromEntries(p.finalSessionIds.map((id) => [id, p.finalAspects[id] ?? null])));
    setOpen(true);
  }

  function toggleDraft(sessionId: string) {
    setDraft((prev) => {
      const next = { ...prev };
      if (sessionId in next) delete next[sessionId];
      else next[sessionId] = null;
      return next;
    });
  }

  async function save() {
    // 除說明會(與觀察員)外,勾選場次皆須指定構面才能儲存(UAT 圖28)
    const missing = Object.entries(draft).filter(([sid, aspect]) => {
      const s = sessions.find((x) => x.id === sid);
      return s && needAspect(s) && !aspect;
    });
    if (missing.length > 0) {
      toast.error('請為每個勾選場次指定構面（說明會除外）');
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/pre-survey/participants/${p.id}/assign`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assignments: Object.entries(draft).map(([sessionId, aspect]) => ({ sessionId, aspect })),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '指派失敗' }));
      toast.error('指派失敗', j.error);
      return;
    }
    // UAT 圖37/49:回饋連動結果(帶入場次→委員入週期指派/觀察員入週期配對;COI 與互斥跳過)
    const j = await res.json().catch(
      () => ({}) as { linkedCycles?: string[]; skippedCoi?: string[]; skippedOther?: string[]; observerHint?: boolean },
    );
    if (j.linkedCycles?.length) toast.success('已儲存指派', `已同步加入稽核週期：${j.linkedCycles.join('、')}`);
    else toast.success('已儲存指派');
    if (j.skippedCoi?.length) toast.warning('利益迴避跳過', `${j.skippedCoi.join('、')}：該員服務於受稽機關，未自動加入週期。`);
    if (j.skippedOther?.length) toast.warning('部分未連動', j.skippedOther.join('、'));
    if (j.observerHint) toast.warning('指導委員待設定', '觀察員已加入該稽核週期的觀察員配對，請至週期「進階設定」指定指導委員。');
    setOpen(false);
    router.refresh();
  }

  // UAT 圖57:歷年唯讀——只詳列指派結果,不提供編輯選單
  if (readOnly) {
    return (
      <span className="inline-flex items-start gap-1 text-caption text-ink-700">
        <MapPin size={13} className="shrink-0 mt-0.5 text-ink-400" />
        {assigned.length > 0 ? (
          <span className="flex flex-col gap-1">
            {assigned.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {s.dateLabel} {s.name}
                {p.finalAspects[s.id] && (
                  <Chip size="sm" tone={ASPECT_CHIP_TONE[p.finalAspects[s.id] as string] ?? 'neutral'}>
                    {p.finalAspects[s.id]}
                  </Chip>
                )}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-ink-400">未指派</span>
        )}
      </span>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="inline-flex items-start gap-1 text-left text-caption text-primary-700 hover:underline focus-ring rounded"
        title="指派最終場次（可指定構面）"
      >
        <MapPin size={13} className="shrink-0 mt-0.5" />
        {/* UAT 圖17/28:被指派場次詳列(逐場次一行 + 該場次構面 chip),不以省略號截斷 */}
        {assigned.length > 0 ? (
          <span className="flex flex-col gap-1">
            {assigned.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {s.dateLabel} {s.name}
                {p.finalAspects[s.id] && (
                  <Chip size="sm" tone={ASPECT_CHIP_TONE[p.finalAspects[s.id] as string] ?? 'neutral'}>
                    {p.finalAspects[s.id]}
                  </Chip>
                )}
              </span>
            ))}
          </span>
        ) : (
          <span>編輯指派</span>
        )}
        <ChevronDown size={12} className="shrink-0 mt-0.5" />
      </button>
      {open && pos && (
        <>
          <button type="button" aria-hidden className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 min-w-[300px] max-h-80 overflow-auto rounded-md border border-rule bg-card p-2 shadow-lg"
            style={{ top: pos.top, left: pos.left }}
          >
            <p className="px-1 pb-1.5 text-caption text-ink-500">勾選場次並指定構面（說明會免構面）</p>
            {options.length === 0 ? (
              <p className="px-2 py-1.5 text-caption text-ink-400">此人尚無勾選「OK」的場次可指派。</p>
            ) : (
              options.map((s) => {
                const on = s.id in draft;
                return (
                  <div key={s.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-caption text-ink-700 hover:bg-paper-sunk">
                    <label className="flex flex-1 min-w-0 items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={on} disabled={busy} onChange={() => toggleDraft(s.id)} className="rounded border-rule" />
                      <span className="truncate">{s.dateLabel} · {s.name}</span>
                    </label>
                    {on && needAspect(s) && (
                      <select
                        value={draft[s.id] ?? ''}
                        disabled={busy}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [s.id]: e.target.value || null }))}
                        className="shrink-0 rounded border border-rule bg-card px-1.5 py-1 text-caption focus-ring"
                        aria-label={`${s.name} 指派構面`}
                      >
                        <option value="">選構面</option>
                        {SURVEY_COMMITTEE_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })
            )}
            <div className="mt-2 flex items-center justify-end gap-2 border-t border-rule pt-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded px-2 py-1 text-caption text-ink-500 hover:underline focus-ring">
                取消
              </button>
              <Button size="sm" onClick={save} loading={busy} disabled={busy}>儲存指派</Button>
            </div>
          </div>
        </>
      )}
    </>
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

  // #1 UAT:只列此受調者勾選「OK」（或已指派）的場次,免逐場對照。以原始 finalSessionIds 判定,
  // 使可見集在對話框開啟期間穩定(切換勾選不會讓已指派但非 OK 的場次消失)。
  const visibleSessions = participant
    ? sessions.filter((s) => participant.availability[s.id] === 'OK' || participant.finalSessionIds.includes(s.id))
    : [];

  return (
    <Dialog
      open={participant !== null}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={participant ? `指派「${participant.name}」的最終場次` : ''}
      description="僅列出此受調者勾選「OK」（或已指派）的場次；指派 ≥1 場即解鎖其差旅與飲食調查（第二階段）。"
    >
      <div className="flex flex-wrap gap-2 pt-2">
        {visibleSessions.map((s) => {
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
        {visibleSessions.length === 0 && (
          <p className="text-body-sm text-ink-500">
            {sessions.length === 0
              ? '此年度尚無場次可指派。'
              : '此受調者尚無勾選「OK」的場次可指派；可於管考表該人列改其場次意願後再指派。'}
          </p>
        )}
      </div>
    </Dialog>
  );
}

// ── 文件審核對話框(檢視 cv/切結書 + 核可/退補) ──
function DocReviewDialog({ participant, onClose, readOnly = false }: { participant: AdminParticipantDTO | null; onClose: () => void; readOnly?: boolean }) {
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

  // UAT 圖51:受調者檔案已齊但未按送審(常見:逾窗後自助端鎖定)→ 中心代為送審後即可審核
  async function submitForParticipant() {
    if (!participant) return;
    setBusy(true);
    const res = await fetch(`/api/pre-survey/participants/${participant.id}/docs/submit`, { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '代為送審失敗' }));
      toast.error('代為送審失敗', j.error);
      return;
    }
    toast.success('已代為送審', '重新開啟該受調者的文件審核即可核可或退補。');
    onClose();
    router.refresh();
  }

  // UAT 圖57:歷年唯讀——只檢視文件,不提供核可/退補/代為送審
  const canReview = !readOnly && participant?.docStatus === 'SUBMITTED';
  return (
    <Dialog
      open={participant !== null}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={participant ? `${participant.name} 的文件${readOnly ? '（歷年檢視）' : '審核'}` : ''}
      description={readOnly ? '歷年資料僅供檢視。' : '檢視受調者繳交的文件；送審（已繳交）狀態可核可或退補。'}
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
          <>
            <p className="text-caption text-ink-500">
              {participant?.docStatus === 'RETURNED'
                ? '已退補，待受調者補件並重新送審後再審核。'
                : '受調者尚未送審文件。'}
            </p>
            {/* UAT 圖51:檔案已齊但受調者未按送審即逾窗 → 中心可代為送審(伺服器對中心豁免時窗),再行審核;圖57 歷年不提供 */}
            {!readOnly && participant && !!participant.ndaFile && (participant.kind === 'OBSERVER' || !!participant.cvFile) && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="tonal" onClick={submitForParticipant} loading={busy} disabled={busy}>
                  代為送審
                </Button>
                <span className="text-caption text-ink-500">檔案已上傳齊全；代為送審後即可核可或退補。</span>
              </div>
            )}
          </>
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
  open, onOpenChange, yearROC, templates, kind, receiptEnabled,
}: { open: boolean; onOpenChange: (o: boolean) => void; yearROC: number; templates: AdminTemplateDTO[]; kind: SurveyParticipantKind; receiptEnabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [togglingReceipt, setTogglingReceipt] = useState(false);
  const bySlot = new Map(templates.map((t) => [t.slot, t]));
  // UAT 圖40:未開放年度領據槽自彈窗隱藏(開關打開才出現上傳槽)
  const slots = SURVEY_TEMPLATE_SLOTS_BY_KIND[kind].filter((s) => s !== 'RECEIPT_OBSERVER' || receiptEnabled);

  // UAT 圖30:年度領據開關——關閉時觀察員自助不顯示領據範本與上傳槽(上傳端亦硬擋)
  async function toggleReceipt(next: boolean) {
    setTogglingReceipt(true);
    const res = await fetch('/api/pre-survey/fill-window', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ year: yearROC + 1911, observerReceiptEnabled: next }),
    });
    setTogglingReceipt(false);
    if (!res.ok) { const j = await res.json().catch(() => ({ error: '設定失敗' })); toast.error('設定失敗', j.error); return; }
    toast.success(next ? '已開放本年度觀察員填寫差旅費領據' : '已關閉本年度差旅費領據');
    router.refresh();
  }

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
    fd.append('label', surveyTemplateSlotLabel(slot, yearROC)); // UAT 圖9:動態年度標籤
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
    <Dialog open={open} onOpenChange={onOpenChange} title={`${yearROC} 年度公版範本（${kind === 'OBSERVER' ? '觀察員' : '委員'}）`} description="上傳空白經歷說明書/切結書等範本，供受調者下載填寫。觀察員切結書與委員分開。可為 Word 或 PDF。一槽一檔，重傳取代。">
      <div className="space-y-3 pt-2">
        {/* UAT 圖30:年度領據開關(僅觀察員面)——有報銷差旅費的年度才開放觀察員填寫領據 */}
        {kind === 'OBSERVER' && (
          <label className="flex items-center gap-2.5 rounded-md border border-rule bg-paper-sunk/50 p-3 text-body-sm text-ink-900 cursor-pointer">
            <input
              type="checkbox"
              className="accent-primary-600"
              checked={receiptEnabled}
              disabled={togglingReceipt}
              onChange={(e) => toggleReceipt(e.target.checked)}
            />
            本年度開放觀察員填寫差旅費領據（有報銷差旅費的年度才開；關閉時觀察員看不到領據範本與上傳欄）
          </label>
        )}
        {slots.map((slot) => {
          const t = bySlot.get(slot);
          return (
            <div key={slot} className="flex items-center justify-between gap-3 rounded-md border border-rule bg-card p-3">
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-ink-900">{surveyTemplateSlotLabel(slot, yearROC)}</p>
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
