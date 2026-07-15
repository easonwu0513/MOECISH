'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { CheckCircle, AlertTriangle, MapPin, CalendarDays, Pencil } from '@/components/icons';
import type { Tone } from '@/lib/tone';
import SurveySelfForm, { type SelfDTO } from './SurveySelfForm';

type Status = { tone: Tone; label: string; hint: string; cta: string };

/**
 * 委員/觀察員總覽的狀態徽章:對齊 mockup 的四態指引
 * (第一階段待完成 / 待指派 / 第二階段待完成 / 已完成;另含退補特例)。
 * 本系統一階拆「意願送出(submittedAt)」與「文件送審(docStatus=SUBMITTED)」兩件,皆完成才算一階完成。
 */
function computeStatus(data: SelfDTO): Status {
  const isObserver = data.kind === 'OBSERVER';
  const docsSubmitted = data.docStatus === 'SUBMITTED';
  const docsReturned = data.docStatus === 'RETURNED';
  const willingnessSent = !!data.submittedAt;
  const needsStage1 = !willingnessSent || !docsSubmitted;
  const isAssigned = data.assignedLabels.length > 0;
  const needsStage2 = !needsStage1 && isAssigned && (data.transport.length === 0 || data.diet.length === 0);
  const waitingForAssignment = !needsStage1 && !isAssigned;

  if (docsReturned) {
    return { tone: 'danger', label: '文件需補件', hint: '中心已退回您的文件，請依退補說明修改後重新送審。', cta: '前往補件' };
  }
  if (needsStage1) {
    const missing: string[] = [];
    if (!willingnessSent) missing.push('出席意願');
    if (!docsSubmitted) missing.push(isObserver ? '文件（保密切結書）' : '文件（經歷說明書與切結書）');
    return { tone: 'warning', label: '第一階段待完成', hint: `尚待完成：${missing.join('、')}。`, cta: '前往填寫' };
  }
  if (waitingForAssignment) {
    return { tone: 'neutral', label: '待中心指派場次', hint: '第一階段已完成。待中心指派最終場次後，再填寫第二階段差旅與飲食。', cta: '檢視' };
  }
  if (needsStage2) {
    return {
      tone: 'primary',
      label: '第二階段待完成',
      hint: `您已獲指派：${data.assignedLabels.join('、')}。請填寫往返交通方式與飲食需求。`,
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

function statusIcon(tone: Tone) {
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
  const [open, setOpen] = useState(false);
  const status = computeStatus(data);

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
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={`${data.yearROC} 年度事前場次調查`}
        footer={<Button variant="text" onClick={() => setOpen(false)}>關閉</Button>}
      >
        <SurveySelfForm data={data} hideHeader />
      </Dialog>
    </>
  );
}
