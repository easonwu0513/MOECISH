'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { CheckCircle, AlertTriangle, MapPin, CalendarDays, Pencil } from '@/components/icons';
import type { Tone } from '@/lib/tone';
import SurveySelfForm, { type SelfDTO } from './SurveySelfForm';

export type Status = { tone: Tone; label: string; hint: string; cta: string };

/**
 * 委員/觀察員總覽的狀態徽章:對齊 mockup 的四態指引
 * (第一階段待完成 / 待指派 / 第二階段待完成 / 已完成;另含退補特例)。
 * 本系統一階拆「意願送出(submittedAt)」與「文件送審(docStatus=SUBMITTED)」兩件,皆完成才算一階完成。
 */
export function computeStatus(data: SelfDTO): Status {
  const isObserver = data.kind === 'OBSERVER';
  const docsSubmitted = data.docStatus === 'SUBMITTED';
  const docsReturned = data.docStatus === 'RETURNED';
  const willingnessSent = !!data.submittedAt;
  const needsStage1 = !willingnessSent || !docsSubmitted;
  const isAssigned = data.assignedLabels.length > 0;
  // UAT 圖14:二階=「需差旅的指派場次」逐場次交通皆填 + 飲食;全為線上場次(needsTravel=false)則二階免填
  const travelSessions = data.assignedSessions.filter((a) => a.needsTravel);
  const needsStage2 =
    !needsStage1 &&
    travelSessions.length > 0 &&
    (travelSessions.some((a) => a.transport.length === 0) || data.diet.length === 0);
  // UAT 圖18:改判「尚無任何需差旅的指派場次」——只被指派線上場次(免差旅)時仍屬「待分派後填報」,不誤顯已完成
  const waitingForAssignment = !needsStage1 && travelSessions.length === 0;

  if (docsReturned) {
    const extra = willingnessSent ? '' : '另出席意願尚未送出，請一併於下方送出。';
    return { tone: 'danger', label: '文件需補件', hint: `中心已退回您的文件，請依退補說明修改後重新送審。${extra}`, cta: '前往補件' };
  }
  if (needsStage1) {
    const missing: string[] = [];
    if (!willingnessSent) missing.push('出席意願');
    if (!docsSubmitted) missing.push(isObserver ? '文件（保密切結書）' : '文件（經歷說明書與切結書）');
    return { tone: 'warning', label: '第一階段待完成', hint: `尚待完成：${missing.join('、')}。`, cta: '前往填寫' };
  }
  if (waitingForAssignment) {
    // UAT 圖18:提醒色 + 明示「等中心分派完場次才填」——含「僅被指派免差旅場次(如線上說明會)」情境
    return { tone: 'warning', label: '第二階段待中心完成場次分派後填報', hint: '第一階段已完成。待中心完成場次分派後，再填寫第二階段差旅（交通住宿）與飲食。', cta: '檢視' };
  }
  if (needsStage2) {
    // UAT 圖18/25:與待分派態統一字樣與提醒色(使用者指定文案;hint 仍引導立即填寫)
    return {
      tone: 'warning',
      label: '第二階段待中心完成場次分派後填報',
      hint: `您已獲指派：${data.assignedLabels.join('、')}。請填寫各場次往返交通方式與飲食需求。`,
      cta: '前往填寫',
    };
  }
  return {
    tone: 'success',
    label: '任務已全數完成',
    hint: `您已獲指派：${data.assignedLabels.join('、')}。如需修改仍可開啟檢視。`,
    cta: '檢視',
  };
}

export function statusIcon(tone: Tone) {
  if (tone === 'success') return <CheckCircle size={16} />;
  if (tone === 'danger' || tone === 'warning') return <AlertTriangle size={16} />;
  if (tone === 'primary') return <MapPin size={16} />;
  return <CalendarDays size={16} />;
}

/**
 * 委員/觀察員自助「總覽」(mockup 改版):問候卡 + 狀態徽章指引 → 點開彈窗填寫/檢視。
 * 表單本體沿用 SurveySelfForm(全部後端保證不變),只是改由總覽卡引導入口。
 */
export default function SurveySelfDashboard({ data, userName }: { data: SelfDTO; userName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const status = computeStatus(data);
  // 關窗時 refresh:意願鈕/差旅 pill 為樂觀存檔(不各自 refresh),關窗才同步伺服器狀態回本卡,
  // 使總覽徽章 computeStatus(data) 正確、重開表單以最新 data 初始化(否則會像資料未存)。
  const close = () => { setOpen(false); router.refresh(); };

  return (
    <>
      <Card variant="outlined" className="border-l-[3px] border-l-primary-500">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full bg-primary-600 text-white flex items-center justify-center text-title-lg font-semibold shrink-0">
              {userName.charAt(0)}
            </div>
            <div className="min-w-0">
              <h2 className="text-title-md text-ink-900">{userName} 您好</h2>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <Chip size="sm" tone="neutral">{data.kind === 'OBSERVER' ? '觀察員' : '委員'}</Chip>
                <Chip size="sm" tone={status.tone} dot>
                  <span className="inline-flex items-center gap-1">{statusIcon(status.tone)}{status.label}</span>
                </Chip>
              </div>
            </div>
          </div>
          <Button onClick={() => setOpen(true)} leadingIcon={<Pencil size={16} />}>{status.cta}</Button>
        </div>
        <p className="mt-4 text-body-sm text-ink-600">{status.hint}</p>
        {(() => {
          // #5:中心指定填報欄位若仍有未填,於總覽提醒(即使主流程已完成也看得到)
          const pending = data.customFields.filter((f) => !f.value.trim());
          if (pending.length === 0) return null;
          const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
          const overdue = pending.filter((f) => f.dueDate && f.dueDate < today).length;
          return (
            <p className={`mt-2 text-caption ${overdue > 0 ? 'text-danger-600' : 'text-ink-500'}`}>
              另有中心指定填報欄位 {pending.length} 項待填{overdue > 0 ? `（其中 ${overdue} 項已逾期）` : ''}，請點「{status.cta}」開啟填寫。
            </p>
          );
        })()}
      </Card>

      <Dialog
        open={open}
        onOpenChange={(o) => { if (!o) close(); }}
        size="lg"
        title={`${data.yearROC} 年度事前場次調查`}
        footer={<Button variant="text" onClick={close}>關閉</Button>}
      >
        {/* 送出意願/送審文件後,伺服器狀態變動 → 以此 key 重掛表單反映最新(彈窗維持開啟);
            聯絡/意願三態/差旅 pill 用樂觀 local state 且不變動此 key,編輯途中不會被重掛打斷。 */}
        <SurveySelfForm key={`${data.submittedAt ?? 'draft'}-${data.docStatus}-${data.docReviewed ? 'r' : 'n'}`} data={data} hideHeader />
      </Dialog>
    </>
  );
}
