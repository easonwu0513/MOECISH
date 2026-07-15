'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { useToast } from '@/components/ui/Toast';
import { CheckCircle, MapPin, AlertTriangle, Paperclip } from '@/components/icons';
import { surveyDocDisplay } from '@/lib/pre-survey';
import {
  SURVEY_AVAILABILITY_STATUSES,
  SURVEY_AVAILABILITY_LABELS,
  SURVEY_TRANSPORT_OPTIONS,
  SURVEY_DIET_OPTIONS,
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
  phone: string | null;
  email: string | null;
  submittedAt: string | null;
  docStatus: string;
  docReviewed: boolean;
  rejectReason: string | null;
  cvFile: { id: string; name: string } | null;
  ndaFile: { id: string; name: string } | null;
  templates: SelfTemplateDTO[];
  transport: string[];
  diet: string[];
  travelNote: string | null;
  assignedLabels: string[]; // 已指派的最終場次(含真實地名,指派後揭露)
  sessions: SelfSessionDTO[];
};

export default function SurveySelfForm({ data }: { data: SelfDTO }) {
  const router = useRouter();
  const toast = useToast();

  const [phone, setPhone] = useState(data.phone ?? '');
  const [email, setEmail] = useState(data.email ?? '');
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
  const [transport, setTransport] = useState<string[]>(data.transport);
  const [diet, setDiet] = useState<string[]>(data.diet);
  const [travelNote, setTravelNote] = useState(data.travelNote ?? '');
  const [savingTravel, setSavingTravel] = useState(false);
  const [travelBusy, setTravelBusy] = useState(false);

  const isObserver = data.kind === 'OBSERVER';
  const isAssigned = data.assignedLabels.length > 0;
  const docStatus = data.docStatus as SurveyDocStatus;
  const docLocked = docStatus === 'SUBMITTED'; // 送審後鎖上傳(待中心審核/退補)

  async function saveContact() {
    setSavingContact(true);
    const res = await fetch(`/api/pre-survey/participants/${data.participantId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: phone.trim() || null, email: email.trim() || null }),
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
    setSubmitting(true);
    const res = await fetch(`/api/pre-survey/participants/${data.participantId}/submit`, { method: 'POST' });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '送出失敗' }));
      toast.error('送出失敗', j.error);
      return;
    }
    toast.success('已送出意願', '未勾選的場次已自動記為 N/A;之後仍可修改後再送出。');
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

  async function putTravel(patch: { transport?: string[]; diet?: string[]; travelNote?: string | null }, silent = false) {
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

  async function toggleMulti(kind: 'transport' | 'diet', value: string) {
    const cur = kind === 'transport' ? transport : diet;
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    if (kind === 'transport') setTransport(next);
    else setDiet(next); // 樂觀
    setTravelBusy(true);
    const ok = await putTravel({ [kind]: next }, true);
    setTravelBusy(false);
    if (!ok) {
      // 顯式回滾本地 state(router.refresh 不會重置 useState;失敗不可讓 pill 停在錯誤選取)
      if (kind === 'transport') setTransport(cur);
      else setDiet(cur);
    }
  }

  async function saveTravelNote() {
    setSavingTravel(true);
    await putTravel({ travelNote: travelNote.trim() || null });
    setSavingTravel(false);
  }

  return (
    <div className="space-y-6">
      <Card variant="outlined">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-title-md text-ink-900">{data.yearROC} 年度事前場次調查</h2>
            <p className="mt-1 text-body-sm text-ink-500">
              請填寫各場次的出席意願（OK／待定／N/A）並繳交相關文件。{isObserver ? '' : '委員另需繳交經歷說明書與切結書。'}
            </p>
          </div>
          {data.submittedAt ? <Chip tone="success" dot>意願已送出</Chip> : <Chip tone="warning" dot>意願尚未送出</Chip>}
        </div>
      </Card>

      {/* 聯絡資訊 */}
      <Card variant="outlined">
        <h3 className="text-label text-ink-900 mb-3">聯絡資訊</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="電子郵件" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="用於場次調查聯繫" />
          <TextField label="聯絡電話" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="mt-3">
          <Button size="sm" variant="tonal" onClick={saveContact} loading={savingContact} disabled={savingContact}>
            儲存聯絡資訊
          </Button>
        </div>
      </Card>

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
          <p className="text-caption text-ink-500 mb-2">下載公版範本</p>
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
                      <Paperclip size={13} /> {t.label}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-card px-3 py-1.5 text-caption text-ink-400">{t.label}（無檔案）</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 上傳個人文件 */}
        <div className="grid gap-3 sm:grid-cols-2">
          {!isObserver && (
            <DocSlot
              title="經歷說明書"
              file={data.cvFile}
              locked={docLocked}
              uploading={uploadingSlot === 'CV'}
              onUpload={(e) => uploadDoc('CV', e)}
            />
          )}
          <DocSlot
            title="聘任同意暨保密切結書"
            file={data.ndaFile}
            locked={docLocked}
            uploading={uploadingSlot === 'NDA'}
            onUpload={(e) => uploadDoc('NDA', e)}
          />
        </div>

        <div className="mt-3 flex items-center gap-3">
          {docLocked ? (
            <span className="text-caption text-ink-500">文件已送審，待中心審核；如需修改請待退補後再上傳。</span>
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

      {/* 差旅二階(指派後解鎖) */}
      {isAssigned ? (
        <Card variant="outlined" className="border-l-[3px] border-l-success-500">
          <div className="flex items-start gap-2 mb-3">
            <MapPin size={18} className="mt-0.5 shrink-0 text-success-700" />
            <div>
              <h3 className="text-label text-ink-900">第二階段：差旅與飲食調查</h3>
              <p className="mt-1 text-body-sm text-ink-900">您被指派的最終場次：{data.assignedLabels.join('、')}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <MultiPills label="往返交通方式（含住宿，可複選）" options={SURVEY_TRANSPORT_OPTIONS} selected={transport} busy={travelBusy} onToggle={(v) => toggleMulti('transport', v)} />
            <MultiPills label="飲食需求（可複選）" options={SURVEY_DIET_OPTIONS} selected={diet} busy={travelBusy} onToggle={(v) => toggleMulti('diet', v)} />
          </div>
          <div className="mt-4">
            <Textarea label="差旅特殊備註" value={travelNote} onChange={(e) => setTravelNote(e.target.value)} rows={2} placeholder="如被指派多場次且各場次需求不同，請詳述。" />
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

      {/* 逐場次意願(地名以序號匿名) */}
      <Card variant="outlined">
        <h3 className="text-label text-ink-900 mb-1">稽核場次意願調查</h3>
        <p className="text-caption text-ink-500 mb-3">場次地點於意願調查階段以序號呈現；經中心指派最終場次後方揭露實際地點。</p>
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
                        disabled={busySession === s.id}
                        onClick={() => setStatus(s.id, opt)}
                        aria-pressed={on}
                        className={`px-3.5 py-1.5 text-caption font-medium rounded-md transition-colors focus-ring ${
                          on
                            ? opt === 'OK'
                              ? 'bg-success-600 text-white'
                              : opt === 'PENDING'
                              ? 'bg-warning-500 text-white'
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
          <Button onClick={submit} loading={submitting} disabled={submitting} leadingIcon={<CheckCircle size={16} />}>
            {data.submittedAt ? '重新送出意願' : '送出意願'}
          </Button>
          <span className="text-caption text-ink-500">送出後未勾選的場次將記為 N/A;送出後仍可修改再送。</span>
        </div>
      )}
    </div>
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
