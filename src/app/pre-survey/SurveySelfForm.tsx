'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { Alert } from '@/components/ui/Alert';
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { useToast } from '@/components/ui/Toast';
import { CheckCircle, MapPin, AlertTriangle, Paperclip } from '@/components/icons';
import { surveyDocDisplay } from '@/lib/pre-survey';
import { fmtROCDateTime } from '@/lib/date';
import {
  SURVEY_AVAILABILITY_STATUSES,
  SURVEY_AVAILABILITY_LABELS,
  SURVEY_TRANSPORT_OPTIONS,
  SURVEY_TRANSIT_MODES,
  TRANSIT_PREFIX,
  SURVEY_DIET_OPTIONS,
  surveyTemplateSlotLabel,
  type SurveyAvailabilityStatus,
  type SurveyDocStatus,
} from '@/lib/types';

export type SelfSessionDTO = {
  id: string;
  anonLabel: string; // 匿名序號標籤(地名已隱藏)
  isRequired: boolean;
  remark: string | null;
  status: SurveyAvailabilityStatus | null;
};
export type SelfTemplateDTO = { id: string; slot: string; label: string; fileId: string | null; fileName: string | null };
export type SelfDTO = {
  participantId: string;
  yearROC: number;
  kind: 'MEMBER' | 'OBSERVER';
  accountEmail: string | null; // 帳號 email(主要信箱空白時預設代入)
  phone: string | null;
  email: string | null;
  phone2: string | null; // 次要聯絡電話
  email2: string | null; // 次要聯絡信箱
  proxyName: string | null; // 代理聯絡人姓名/職稱(如「王小明/秘書」)
  proxyEmail: string | null; // 代理聯絡人信箱(null=無代理)
  proxyPhone: string | null; // 代理聯絡人電話
  submittedAt: string | null;
  // UAT 填報時窗:canEditAvailability=false 時鎖定意願編修/送出並顯示時窗說明
  canEditAvailability: boolean;
  canUploadDocs: boolean; // UAT 圖7:文件上傳與意願共用第一時窗
  canEditTravel: boolean; // UAT 圖7:差旅(交通/飲食)走第二時窗
  travelWindow: { openAt: string | null; closeAt: string | null; state: 'OPEN' | 'BEFORE' | 'AFTER' } | null;
  editUnlocked: boolean;
  fillWindow: { openAt: string | null; closeAt: string | null; state: 'OPEN' | 'BEFORE' | 'AFTER' } | null;
  docStatus: string;
  docReviewed: boolean;
  rejectReason: string | null;
  cvFile: { id: string; name: string } | null;
  ndaFile: { id: string; name: string } | null;
  priorCvFile: { id: string; name: string } | null; // 中心提供的舊版經歷說明書參考(僅委員;供參考)
  templates: SelfTemplateDTO[];
  transport: string[];
  diet: string[];
  travelNote: string | null;
  // #5:中心開放受調者自行填寫的自訂欄位(selfEditable);dueDate 供本人參考,逾期由 timer 催辦
  customFields: { id: string; title: string; dueDate: string | null; value: string }[];
  assignedLabels: string[]; // 已指派的最終場次(含真實地名,指派後揭露)
  // UAT 圖14:逐場次差旅——交通(含住宿)依場次各填;needsTravel=false(線上)場次免填
  assignedSessions: { sessionId: string; label: string; needsTravel: boolean; transport: string[] }[];
  sessions: SelfSessionDTO[];
};

export default function SurveySelfForm({ data, hideHeader }: { data: SelfDTO; hideHeader?: boolean }) {
  const router = useRouter();
  const toast = useToast();

  // 主要信箱空白時預設代入帳號 email(本人可改)
  const [email, setEmail] = useState(data.email ?? data.accountEmail ?? '');
  const [phone, setPhone] = useState(data.phone ?? '');
  const [email2, setEmail2] = useState(data.email2 ?? '');
  const [phone2, setPhone2] = useState(data.phone2 ?? '');
  const [showSecondary, setShowSecondary] = useState(!!(data.email2 || data.phone2));
  const [proxyName, setProxyName] = useState(data.proxyName ?? '');
  const [proxyEmail, setProxyEmail] = useState(data.proxyEmail ?? '');
  const [proxyPhone, setProxyPhone] = useState(data.proxyPhone ?? '');
  const [hasProxy, setHasProxy] = useState(!!(data.proxyName || data.proxyEmail || data.proxyPhone));
  const [statuses, setStatuses] = useState<Record<string, SurveyAvailabilityStatus | null>>(
    Object.fromEntries(data.sessions.map((s) => [s.id, s.status])),
  );
  const [savingContact, setSavingContact] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busySession, setBusySession] = useState<string | null>(null);
  // 文件繳交
  const [uploadingSlot, setUploadingSlot] = useState<'CV' | 'NDA' | null>(null);
  const [submittingDocs, setSubmittingDocs] = useState(false);
  // 差旅二階(樂觀 local state)
  // UAT 圖14:交通逐場次(Record<sessionId, string[]>);飲食全場次一致
  const [sessionTransports, setSessionTransports] = useState<Record<string, string[]>>(
    Object.fromEntries(data.assignedSessions.map((a) => [a.sessionId, a.transport])),
  );
  const [diet, setDiet] = useState<string[]>(data.diet);
  const [travelNote, setTravelNote] = useState(data.travelNote ?? '');
  const [savingTravel, setSavingTravel] = useState(false);
  const [travelBusy, setTravelBusy] = useState(false);

  const isObserver = data.kind === 'OBSERVER';
  const isAssigned = data.assignedLabels.length > 0;
  const docStatus = data.docStatus as SurveyDocStatus;
  const docLocked = docStatus === 'SUBMITTED'; // 送審後鎖上傳(待中心審核/退補)
  const docsWindowLocked = !data.canUploadDocs; // UAT 圖7:文件上傳逾第一時窗鎖定(editUnlocked 豁免已算入)

  async function saveContact() {
    // UAT 圖21:主要聯絡方式必填(信箱+電話);後端同步強制
    if (!email.trim()) { toast.error('請填寫主要電子郵件'); return; }
    if (!phone.trim()) { toast.error('請填寫主要聯絡電話'); return; }
    setSavingContact(true);
    const res = await fetch(`/api/pre-survey/participants/${data.participantId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: phone.trim() || null,
        email: email.trim() || null,
        phone2: phone2.trim() || null,
        email2: email2.trim() || null,
        // 取消勾選「有代理聯絡人」時送 null 清除,避免殘留舊代理個資
        proxyName: hasProxy ? proxyName.trim() || null : null,
        proxyEmail: hasProxy ? proxyEmail.trim() || null : null,
        proxyPhone: hasProxy ? proxyPhone.trim() || null : null,
      }),
    });
    setSavingContact(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return;
    }
    toast.success('已儲存聯絡資訊');
    router.refresh();
  }

  async function setStatus(sessionId: string, status: SurveyAvailabilityStatus) {
    if (!data.canEditAvailability) return; // 逾填報時窗鎖定(按鈕亦 disabled,此為防禦)
    const prev = statuses[sessionId] ?? null;
    setStatuses((s) => ({ ...s, [sessionId]: status }));
    setBusySession(sessionId);
    const res = await fetch(`/api/pre-survey/participants/${data.participantId}/availability`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, status }),
    });
    setBusySession(null);
    if (!res.ok) {
      setStatuses((s) => ({ ...s, [sessionId]: prev }));
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
    }
  }

  async function submit() {
    if (!data.canEditAvailability) return; // 逾填報時窗(按鈕亦 disabled)
    // 所有場次必填:未答齊先擋在前端(後端 submit route 亦硬擋)
    const unanswered = data.sessions.filter((s) => !statuses[s.id]);
    if (unanswered.length > 0) {
      toast.error('尚有場次未填', `所有場次皆須填寫，請完成剩餘 ${unanswered.length} 個場次的出席意願（OK 或 NO）後再送出。`);
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/pre-survey/participants/${data.participantId}/submit`, { method: 'POST' });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '送出失敗' }));
      toast.error('送出失敗', j.error);
      return;
    }
    toast.success('已送出意願', '於開放期間內仍可修改後再送出。');
    router.refresh();
  }

  async function uploadDoc(slot: 'CV' | 'NDA', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error('檔案超過 20MB 上限');
      return;
    }
    setUploadingSlot(slot);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('slot', slot);
    const res = await fetch(`/api/pre-survey/participants/${data.participantId}/docs`, { method: 'POST', body: fd });
    setUploadingSlot(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '上傳失敗' }));
      toast.error('上傳失敗', j.error);
      return;
    }
    toast.success('已上傳');
    router.refresh();
  }

  async function submitDocs() {
    setSubmittingDocs(true);
    const res = await fetch(`/api/pre-survey/participants/${data.participantId}/docs/submit`, { method: 'POST' });
    setSubmittingDocs(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '送審失敗' }));
      toast.error('送審失敗', j.error);
      return;
    }
    toast.success('文件已送審', '待中心審核；如需修改請待退補後再上傳。');
    router.refresh();
  }

  async function putTravel(
    patch: { sessionTransport?: { sessionId: string; transport: string[] }; diet?: string[]; travelNote?: string | null },
    silent = false,
  ) {
    const res = await fetch(`/api/pre-survey/participants/${data.participantId}/travel`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return false;
    }
    if (!silent) toast.success('已儲存');
    return true;
  }

  // UAT 圖14/20:交通逐場次整組替換(picker 內含大眾運輸複合 token 邏輯);失敗顯式回滾本地 state
  async function replaceSessionTransport(sessionId: string, next: string[]) {
    const cur = sessionTransports[sessionId] ?? [];
    setSessionTransports((prev) => ({ ...prev, [sessionId]: next })); // 樂觀
    setTravelBusy(true);
    const ok = await putTravel({ sessionTransport: { sessionId, transport: next } }, true);
    setTravelBusy(false);
    if (!ok) setSessionTransports((prev) => ({ ...prev, [sessionId]: cur }));
  }

  async function toggleDiet(value: string) {
    const cur = diet;
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    setDiet(next); // 樂觀
    setTravelBusy(true);
    const ok = await putTravel({ diet: next }, true);
    setTravelBusy(false);
    if (!ok) setDiet(cur); // 顯式回滾(router.refresh 不會重置 useState)
  }

  async function saveTravelNote() {
    setSavingTravel(true);
    await putTravel({ travelNote: travelNote.trim() || null });
    setSavingTravel(false);
  }

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <Card variant="outlined">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-title-md text-ink-900">{data.yearROC} 年度事前場次調查</h2>
              <p className="mt-1 text-body-sm text-ink-500">
                請填寫各場次的出席意願（OK／NO）並繳交相關文件。{isObserver ? '' : '委員另需繳交經歷說明書與切結書。'}
              </p>
            </div>
            {data.submittedAt ? <Chip tone="success" dot>意願已送出</Chip> : <Chip tone="warning" dot>意願尚未送出</Chip>}
          </div>
        </Card>
      )}

      {/* 聯絡資訊(主要信箱預設代入帳號;可另加次要聯絡) */}
      <Card variant="outlined">
        <h3 className="text-label text-ink-900 mb-1">聯絡資訊</h3>
        <p className="text-caption text-ink-500 mb-3">主要電子郵件已預先代入您的帳號信箱；如需以其他信箱、電話聯繫，可修改或新增次要聯絡。</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="電子郵件（主要，必填）" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="用於場次調查聯繫" />
          <TextField label="聯絡電話（主要，必填）" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="必填" />
        </div>
        {showSecondary ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TextField label="電子郵件（次要，選填）" value={email2} onChange={(e) => setEmail2(e.target.value)} placeholder="另一組聯絡信箱" />
            <TextField label="聯絡電話（次要，選填）" value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="另一組聯絡電話" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSecondary(true)}
            className="mt-3 inline-flex items-center gap-1 text-caption text-primary-700 hover:underline focus-ring rounded"
          >
            ＋ 新增次要聯絡信箱／電話
          </button>
        )}
        {/* 代理聯絡人(UAT):勾選展開;取消勾選並儲存即清除 */}
        <label className="mt-3 flex items-center gap-2.5 cursor-pointer text-body-sm text-ink-900">
          <input
            type="checkbox"
            className="accent-primary-600"
            checked={hasProxy}
            onChange={(e) => setHasProxy(e.target.checked)}
          />
          有代理聯絡人（由他人代為聯絡時勾選）
        </label>
        {hasProxy && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TextField
              label="代理人姓名/職稱"
              value={proxyName}
              onChange={(e) => setProxyName(e.target.value)}
              placeholder="如：王小明/秘書"
            />
            <TextField
              label="代理聯絡人電子郵件"
              value={proxyEmail}
              onChange={(e) => setProxyEmail(e.target.value)}
              placeholder="代理聯絡人的信箱"
            />
            <TextField
              label="代理聯絡人電話"
              value={proxyPhone}
              onChange={(e) => setProxyPhone(e.target.value)}
              placeholder="代理聯絡人的電話"
            />
          </div>
        )}
        <div className="mt-3">
          <Button size="sm" variant="tonal" onClick={saveContact} loading={savingContact} disabled={savingContact}>
            儲存聯絡資訊
          </Button>
        </div>
      </Card>

      {/* #5:中心指定填報欄位(僅開放受調者填寫的自訂欄位;有到期日者逾期由系統催辦) */}
      {data.customFields.length > 0 && (
        <SelfCustomFields participantId={data.participantId} fields={data.customFields} />
      )}

      {/* 文件繳交(公版下載 + 上傳 + 送審) */}
      <Card variant="outlined">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h3 className="text-label text-ink-900">文件繳交</h3>
          {(() => {
            const d = surveyDocDisplay(docStatus, data.docReviewed);
            return <Chip size="sm" tone={d.tone}>{d.label}</Chip>;
          })()}
        </div>

        {docStatus === 'RETURNED' && data.rejectReason && (
          <div className="mb-3 flex items-start gap-2 rounded-md bg-danger-50 border border-danger-100 px-3 py-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger-600" />
            <p className="text-caption text-ink-700"><span className="font-medium">需補件：</span>{data.rejectReason}</p>
          </div>
        )}

        {/* 下載公版範本 */}
        <div className="mb-4">
          <p className="text-caption text-ink-500 mb-2">下載待填文件</p>
          {data.templates.length === 0 ? (
            <p className="text-caption text-ink-400">中心尚未提供公版範本。</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {data.templates.map((t) => (
                <li key={t.id}>
                  {t.fileId ? (
                    <a
                      href={`/api/pre-survey/files/${t.fileId}/download`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-card px-3 py-1.5 text-caption text-primary-700 hover:bg-paper-sunk focus-ring"
                    >
                      <Paperclip size={13} /> {surveyTemplateSlotLabel(t.slot, data.yearROC)}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-card px-3 py-1.5 text-caption text-ink-400">{surveyTemplateSlotLabel(t.slot, data.yearROC)}（無檔案）</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 中心提供的舊版經歷說明書參考(僅委員;UAT 圖19:加「歷史文件參考」小標,前綴動態去年度全銜) */}
        {!isObserver && data.priorCvFile && (
          <div className="mb-4">
            <p className="text-caption text-ink-500 mb-2">歷史文件參考</p>
            <div className="flex items-start gap-2 rounded-md bg-primary-50/60 border border-primary-100 px-3 py-2">
              <Paperclip size={14} className="mt-0.5 shrink-0 text-primary-700" />
              <p className="text-caption text-ink-700">
                {data.yearROC - 1} 年度稽核委員候選人經歷說明書：
                <a href={`/api/pre-survey/files/${data.priorCvFile.id}/download`} className="ml-1 text-primary-700 hover:underline break-all">
                  {data.priorCvFile.name}
                </a>
              </p>
            </div>
          </div>
        )}

        {/* 上傳個人文件 */}
        <div className="grid gap-3 sm:grid-cols-2">
          {!isObserver && (
            <DocSlot
              title="經歷說明書"
              file={data.cvFile}
              locked={docLocked || docsWindowLocked}
              uploading={uploadingSlot === 'CV'}
              onUpload={(e) => uploadDoc('CV', e)}
            />
          )}
          <DocSlot
            title="聘任同意暨保密切結書"
            file={data.ndaFile}
            locked={docLocked || docsWindowLocked}
            uploading={uploadingSlot === 'NDA'}
            onUpload={(e) => uploadDoc('NDA', e)}
          />
        </div>

        <div className="mt-3 flex items-center gap-3">
          {docLocked ? (
            <span className="text-caption text-ink-500">
              {data.docReviewed
                ? '文件已核可，如需變更文件，請聯絡中心協助處理！'
                : '文件已送審，待中心審核；如需修改請待退補後再上傳。'}
            </span>
          ) : docsWindowLocked ? (
            <span className="text-caption text-ink-500">
              {data.fillWindow?.state === 'BEFORE'
                ? `文件上傳尚未開始${data.fillWindow.openAt ? `（開放時間：${fmtROCDateTime(data.fillWindow.openAt)} 起）` : ''}。`
                : `文件上傳已截止${data.fillWindow?.closeAt ? `（截止時間：${fmtROCDateTime(data.fillWindow.closeAt)}）` : ''}。如需補件，請聯絡中心開放。`}
            </span>
          ) : (
            <>
              <Button size="sm" onClick={submitDocs} loading={submittingDocs} disabled={submittingDocs}>
                送審文件
              </Button>
              <span className="text-caption text-ink-500">
                {isObserver ? '需繳交切結書' : '需繳交經歷說明書與切結書'}；送審後由中心審核。
              </span>
            </>
          )}
        </div>
      </Card>

      {/* 逐場次意願(地名以序號匿名;UAT:置於文件繳交之下、差旅二階之上) */}
      <Card variant="outlined">
        <h3 className="text-label text-ink-900 mb-3">稽核場次意願調查</h3>
        {!data.canEditAvailability && (
          <Alert tone="warning" icon={<AlertTriangle size={15} />} className="mb-3">
            {data.fillWindow?.state === 'BEFORE' ? (
              <>意願填報尚未開始{data.fillWindow.openAt ? `（開放時間：${fmtROCDateTime(data.fillWindow.openAt)} 起）` : ''}。如需提前填報，請聯絡中心開放。</>
            ) : (
              <>意願填報已截止{data.fillWindow?.closeAt ? `（截止時間：${fmtROCDateTime(data.fillWindow.closeAt)}）` : ''}。如需補填或變更，請聯絡中心開放後再填。</>
            )}
          </Alert>
        )}
        {data.sessions.length === 0 ? (
          <p className="py-8 text-center text-body-sm text-ink-500">此年度尚無規劃稽核場次。</p>
        ) : (
          <ul className="divide-y divide-rule">
            {data.sessions.map((s) => (
              <li key={s.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body-sm font-medium text-ink-900">{s.anonLabel}</span>
                    {s.isRequired && <Chip size="sm" tone="danger">必參加</Chip>}
                  </div>
                  {s.remark && <p className="mt-0.5 text-caption text-ink-500">{s.remark}</p>}
                </div>
                <div className="inline-flex rounded-lg bg-paper-sunk p-1" role="group" aria-label={`${s.anonLabel} 意願`}>
                  {SURVEY_AVAILABILITY_STATUSES.map((opt) => {
                    const on = statuses[s.id] === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        disabled={busySession === s.id || !data.canEditAvailability}
                        onClick={() => setStatus(s.id, opt)}
                        aria-pressed={on}
                        className={`px-3.5 py-1.5 text-caption font-medium rounded-md transition-colors focus-ring ${
                          on
                            ? opt === 'OK'
                              ? 'bg-success-600 text-white'
                              : 'bg-ink-700 text-white'
                            : 'text-ink-500 hover:text-ink-700'
                        }`}
                      >
                        {SURVEY_AVAILABILITY_LABELS[opt]}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.sessions.length > 0 && (
        <div className="flex items-center gap-3">
          <Button onClick={submit} loading={submitting} disabled={submitting || !data.canEditAvailability || busySession !== null} leadingIcon={<CheckCircle size={16} />}>
            {data.submittedAt ? '重新送出意願' : '送出意願'}
          </Button>
          <span className="text-caption text-ink-500">所有場次皆須填寫 OK 或 NO 才能送出；於開放期間內送出後仍可修改再送。</span>
        </div>
      )}

      {/* 差旅二階(指派後解鎖;UAT:置於稽核場次意願之下;圖7:另受第二時窗管制) */}
      {isAssigned && !data.canEditTravel ? (
        <Card variant="outlined" className="bg-paper-sunk/40">
          <div className="flex items-start gap-2 text-ink-500">
            <MapPin size={18} className="mt-0.5 shrink-0" />
            <div>
              <h3 className="text-label text-ink-700">第二階段：差旅與飲食調查</h3>
              <p className="mt-1 text-caption">
                {data.travelWindow?.state === 'BEFORE'
                  ? `差旅調查尚未開放${data.travelWindow.openAt ? `（開放時間：${fmtROCDateTime(data.travelWindow.openAt)} 起）` : ''}。`
                  : `差旅調查已截止${data.travelWindow?.closeAt ? `（截止時間：${fmtROCDateTime(data.travelWindow.closeAt)}）` : ''}。如需補填或變更，請聯絡中心開放。`}
              </p>
            </div>
          </div>
        </Card>
      ) : isAssigned ? (
        <Card variant="outlined" className="border-l-[3px] border-l-success-500">
          <div className="flex items-start gap-2 mb-3">
            <MapPin size={18} className="mt-0.5 shrink-0 text-success-700" />
            <div>
              <h3 className="text-label text-ink-900">第二階段：差旅與飲食調查</h3>
              <p className="mt-1 text-body-sm text-ink-900">您被指派的最終場次：{data.assignedLabels.join('、')}</p>
            </div>
          </div>
          {/* UAT 圖14:交通(含住宿)逐場次填(地點不同交通不同);線上場次免填;飲食全場次一致 */}
          {(() => {
            const travelSessions = data.assignedSessions.filter((a) => a.needsTravel);
            const onlineSessions = data.assignedSessions.filter((a) => !a.needsTravel);
            return (
              <div className="space-y-4">
                {travelSessions.map((a) => (
                  <div key={a.sessionId} className="rounded-md border border-rule bg-card p-3.5">
                    <SessionTransportPicker
                      sessionId={a.sessionId}
                      label={`${a.label}：往返交通方式（含住宿，可複選）`}
                      tokens={sessionTransports[a.sessionId] ?? []}
                      busy={travelBusy}
                      onChange={(next) => replaceSessionTransport(a.sessionId, next)}
                    />
                  </div>
                ))}
                {onlineSessions.length > 0 && (
                  <p className="text-caption text-ink-500">
                    {onlineSessions.map((a) => a.label).join('、')}：線上辦理，無需填寫交通住宿。
                  </p>
                )}
                {travelSessions.length > 0 && (
                  <MultiPills label="飲食需求（全部場次一致，可複選）" options={SURVEY_DIET_OPTIONS} selected={diet} busy={travelBusy} onToggle={(v) => toggleDiet(v)} />
                )}
              </div>
            );
          })()}
          <div className="mt-4">
            <Textarea label="特殊備註（如需協助安排停車等，請註明車號）" value={travelNote} onChange={(e) => setTravelNote(e.target.value)} rows={2} placeholder="請填寫此場次備註" />
            <div className="mt-2">
              <Button size="sm" variant="tonal" onClick={saveTravelNote} loading={savingTravel} disabled={savingTravel}>儲存備註</Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card variant="outlined" className="bg-paper-sunk/40">
          <div className="flex items-start gap-2 text-ink-500">
            <MapPin size={18} className="mt-0.5 shrink-0" />
            <div>
              <h3 className="text-label text-ink-700">第二階段：差旅與飲食調查</h3>
              <p className="mt-1 text-caption">中心指派最終場次後，此區將開放填寫交通與飲食需求。</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── #5:中心指定填報欄位(受調者自助填寫;每格獨立儲存,逾期由 timer 催辦) ──
/** ISO(YYYY-MM-DD)→ 民國 YY/M/D 精簡標籤。 */
function rocDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(y) - 1911}/${Number(m)}/${Number(d)}`;
}
/** 台北今日 YYYY-MM-DD(以 +8 時區近似,供逾期視覺提示;權威催辦仍以伺服器 timer 為準)。 */
function taipeiTodayISO(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function SelfCustomFields({ participantId, fields }: { participantId: string; fields: SelfDTO['customFields'] }) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.id, f.value])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const today = taipeiTodayISO();

  async function save(columnId: string) {
    const value = (values[columnId] ?? '').trim();
    setSavingId(columnId);
    const res = await fetch(`/api/pre-survey/participants/${participantId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customValue: { columnId, value } }),
    });
    setSavingId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return;
    }
    toast.success('已儲存');
    router.refresh();
  }

  return (
    <Card variant="outlined">
      <h3 className="text-label text-ink-900 mb-1">中心指定填報欄位</h3>
      <p className="text-caption text-ink-500 mb-3">以下欄位由中心指定，請於到期日前完成填寫；每格請個別按「儲存」。</p>
      <div className="space-y-3">
        {fields.map((f) => {
          // 逾期/紅框以「伺服器已存值 f.value」判定(與總覽提醒、run-tracking 催辦 timer 一致);
          // 不用本地未存的 values[f.id],否則打字未按儲存就清掉警示，造成「看似已填、實則未存」誤導。
          const empty = !(f.value ?? '').trim();
          const overdue = !!f.dueDate && empty && f.dueDate < today;
          return (
            <div key={f.id} className={`rounded-md border p-3 ${overdue ? 'border-danger-200 bg-danger-50/40' : 'border-rule bg-card'}`}>
              <TextField
                label={f.title}
                value={values[f.id] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
              />
              <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                <span className={`text-caption ${overdue ? 'text-danger-600' : 'text-ink-500'}`}>
                  {f.dueDate ? `到期日：${rocDateLabel(f.dueDate)}${overdue ? '（已逾期，請儘速填寫）' : ''}` : '無到期日'}
                </span>
                <Button size="sm" variant="tonal" onClick={() => save(f.id)} loading={savingId === f.id} disabled={savingId === f.id}>
                  儲存
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── 單一文件槽(已上傳=下載連結,未上傳=提示;可上傳/替換) ──
function DocSlot({
  title, file, locked, uploading, onUpload,
}: {
  title: string;
  file: { id: string; name: string } | null;
  locked: boolean;
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="rounded-md border border-rule bg-card p-3">
      <p className="text-body-sm font-medium text-ink-900">{title}</p>
      <div className="mt-1.5">
        {file ? (
          <a href={`/api/pre-survey/files/${file.id}/download`} className="text-caption text-primary-700 hover:underline break-all">
            已上傳：{file.name}
          </a>
        ) : (
          <span className="text-caption text-danger-500">尚未上傳</span>
        )}
      </div>
      {!locked && (
        <div className="mt-2">
          <FileUploadButton
            size="sm"
            label={file ? '重新上傳' : '上傳'}
            busy={uploading}
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={onUpload}
          />
        </div>
      )}
    </div>
  );
}

// ── 多選 pill(交通/飲食) ──
/**
 * UAT 圖20:單場次交通選擇器。基本選項為 pills(可複選);「大眾運輸」選取後展開
 * 單選工具(高鐵/火車/客運/其他:簡述),以複合 token 存於 transport 陣列
 * (「大眾運輸：高鐵」「大眾運輸：其他：簡述」);高鐵/非高鐵顯示不同接駁提示。
 */
function SessionTransportPicker({
  sessionId, label, tokens, busy, onChange,
}: { sessionId: string; label: string; tokens: string[]; busy: boolean; onChange: (next: string[]) => void }) {
  const transit = tokens.find((t) => t === TRANSIT_PREFIX || t.startsWith(`${TRANSIT_PREFIX}：`)) ?? null;
  const parts = (transit ?? '').split('：');
  const mode = parts[1] ?? null;
  const [otherNote, setOtherNote] = useState(parts[2] ?? '');
  const basics = tokens.filter((t) => t !== transit);
  const selectedPills = [...basics, ...(transit ? [TRANSIT_PREFIX] : [])];

  function togglePill(v: string) {
    if (v === TRANSIT_PREFIX) {
      onChange(transit ? basics : [...basics, TRANSIT_PREFIX]);
    } else {
      const nextBasics = basics.includes(v) ? basics.filter((x) => x !== v) : [...basics, v];
      onChange([...nextBasics, ...(transit ? [transit] : [])]);
    }
  }
  function setMode(m: string) {
    const token =
      m === '其他' && otherNote.trim() ? `${TRANSIT_PREFIX}：其他：${otherNote.trim()}` : `${TRANSIT_PREFIX}：${m}`;
    onChange([...basics, token]);
  }
  function saveOtherNote() {
    if (mode !== '其他') return;
    const token = otherNote.trim() ? `${TRANSIT_PREFIX}：其他：${otherNote.trim()}` : `${TRANSIT_PREFIX}：其他`;
    if (token !== transit) onChange([...basics, token]);
  }

  return (
    <div>
      <MultiPills label={label} options={SURVEY_TRANSPORT_OPTIONS} selected={selectedPills} busy={busy} onToggle={togglePill} />
      {transit && (
        <div className="mt-3 space-y-2 rounded-md border border-rule bg-paper-sunk/50 p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-sm text-ink-700">
            <span className="text-ink-500">大眾運輸工具：</span>
            {SURVEY_TRANSIT_MODES.map((m) => (
              <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`transit-${sessionId}`}
                  checked={mode === m}
                  disabled={busy}
                  onChange={() => setMode(m)}
                  className="accent-primary-600"
                />
                {m}
              </label>
            ))}
          </div>
          {mode === '其他' && (
            <TextField
              label="其他（請簡述）"
              value={otherNote}
              onChange={(e) => setOtherNote(e.target.value)}
              onBlur={saveOtherNote}
              placeholder="如：自行安排交通"
            />
          )}
          {mode === '高鐵' && (
            <p className="rounded-md border border-primary-100 bg-primary-50/70 px-3 py-2 text-caption text-primary-800">
              ⓘ 本中心將統一安排往返高鐵站與受稽機關間之接駁。
            </p>
          )}
          {(mode === '火車' || mode === '客運' || mode === '其他') && (
            <p className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-caption text-ink-700">
              ⓘ 若您選擇搭乘火車、客運或其他大眾運輸工具，中心將視最終登記人數，彈性評估是否安排接駁車服務，感謝您的配合！
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MultiPills({
  label, options, selected, busy, onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  busy: boolean;
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-label text-ink-700 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              disabled={busy}
              onClick={() => onToggle(opt)}
              aria-pressed={on}
              className={`px-3 py-1.5 rounded-full text-caption font-medium border transition-colors focus-ring ${
                on ? 'bg-primary-600 text-white border-transparent' : 'bg-card border-rule text-ink-600 hover:bg-paper-sunk'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
