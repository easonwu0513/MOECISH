'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { CheckCircle, MapPin } from '@/components/icons';
import {
  SURVEY_AVAILABILITY_STATUSES,
  SURVEY_AVAILABILITY_LABELS,
  type SurveyAvailabilityStatus,
} from '@/lib/types';

export type SelfSessionDTO = {
  id: string;
  anonLabel: string; // 匿名序號標籤(地名已隱藏)
  isRequired: boolean;
  remark: string | null;
  status: SurveyAvailabilityStatus | null;
};
export type SelfDTO = {
  participantId: string;
  yearROC: number;
  kind: 'MEMBER' | 'OBSERVER';
  phone: string | null;
  email: string | null;
  submittedAt: string | null;
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

  const isObserver = data.kind === 'OBSERVER';
  const isAssigned = data.assignedLabels.length > 0;

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
    setStatuses((s) => ({ ...s, [sessionId]: status })); // 樂觀更新
    setBusySession(sessionId);
    const res = await fetch(`/api/pre-survey/participants/${data.participantId}/availability`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, status }),
    });
    setBusySession(null);
    if (!res.ok) {
      setStatuses((s) => ({ ...s, [sessionId]: prev })); // 回滾
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

  return (
    <div className="space-y-6">
      <Card variant="outlined">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-title-md text-ink-900">{data.yearROC} 年度事前場次調查</h2>
            <p className="mt-1 text-body-sm text-ink-500">
              請填寫各場次的出席意願（OK／待定／N/A）。{isObserver ? '' : '委員另需繳交經歷說明書與切結書（後續開放）。'}
            </p>
          </div>
          {data.submittedAt ? (
            <Chip tone="success" dot>已送出</Chip>
          ) : (
            <Chip tone="warning" dot>尚未送出</Chip>
          )}
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

      {/* 已指派最終場次(指派後揭露真實地點) */}
      {isAssigned && (
        <Card variant="outlined" className="border-l-[3px] border-l-success-500">
          <div className="flex items-start gap-2">
            <MapPin size={18} className="mt-0.5 shrink-0 text-success-700" />
            <div>
              <h3 className="text-label text-ink-900">您被指派的最終場次</h3>
              <p className="mt-1 text-body-sm text-ink-900">{data.assignedLabels.join('、')}</p>
              <p className="mt-1 text-caption text-ink-500">差旅與飲食調查（第二階段）將於後續開放填寫。</p>
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
