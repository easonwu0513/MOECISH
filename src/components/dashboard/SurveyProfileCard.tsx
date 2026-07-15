'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Pencil } from '@/components/icons';
import { IdentityBand } from './IdentityBand';
import SurveySelfForm, { type SelfDTO } from '@/app/pre-survey/SurveySelfForm';
import { computeStatus, statusIcon } from '@/app/pre-survey/SurveySelfDashboard';

/**
 * 儀表板身分帶(委員/觀察員且為事前場次調查受調者):
 * 頭像可點(hover 顯編輯圖示)+ subtitle 下方事前場次調查狀態徽章 → 皆開同一自助彈窗。
 * 取代側欄獨立「事前場次調查」入口(UAT:整合進總覽,委員/觀察員不單列)。
 */
export function SurveyProfileCard({
  data,
  avatarChar,
  title,
  subtitle,
  roleChip,
  right,
}: {
  data: SelfDTO;
  avatarChar: string;
  title: string;
  subtitle?: ReactNode;
  roleChip?: ReactNode;
  right?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const status = computeStatus(data);
  // 關窗 refresh:自助頁樂觀存檔(意願/差旅)後同步狀態徽章與重開表單(同 SurveySelfDashboard)
  const close = () => { setOpen(false); router.refresh(); };

  const avatarNode = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="group relative w-11 h-11 rounded-full bg-primary-700 text-white flex items-center justify-center text-title-md shrink-0 focus-ring"
      title="檢視／填寫事前場次調查"
      aria-label="開啟事前場次調查"
    >
      {avatarChar}
      <span className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <Pencil size={16} />
      </span>
    </button>
  );

  const extra = (
    <button type="button" onClick={() => setOpen(true)} className="focus-ring rounded-full text-left" title={status.hint}>
      <Chip size="sm" tone={status.tone} dot>
        <span className="inline-flex items-center gap-1">
          {statusIcon(status.tone)}事前場次調查 · {status.label}
        </span>
      </Chip>
    </button>
  );

  return (
    <>
      <IdentityBand avatarNode={avatarNode} title={title} subtitle={subtitle} roleChip={roleChip} extra={extra} right={right} />
      <Dialog
        open={open}
        onOpenChange={(o) => { if (!o) close(); }}
        size="lg"
        title={`${data.yearROC} 年度事前場次調查`}
        footer={<Button variant="text" onClick={close}>關閉</Button>}
      >
        <SurveySelfForm key={`${data.submittedAt ?? 'draft'}-${data.docStatus}-${data.docReviewed ? 'r' : 'n'}`} data={data} hideHeader />
      </Dialog>
    </>
  );
}
