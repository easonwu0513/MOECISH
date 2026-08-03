'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Pencil } from '@/components/icons';
import { IdentityBand } from './IdentityBand';
import SurveySelfForm, { type SelfDTO } from '@/app/pre-survey/SurveySelfForm';
import { computeStatus, statusIcon } from '@/app/pre-survey/SurveySelfDashboard';

/** UAT 圖50:總覽四步檢核用「前往填寫」鈕——派發事件請 SurveyProfileCard 就地開填寫彈窗(不跳頁)。 */
export function OpenSurveyButton() {
  return (
    <Button size="sm" variant="text" onClick={() => window.dispatchEvent(new Event('moecish:open-survey'))}>
      前往填寫
    </Button>
  );
}

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
  // UAT 圖50:總覽四步檢核的「前往填寫」就地開同一彈窗(OpenSurveyButton 派發事件),不再跳轉調查頁
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('moecish:open-survey', onOpen);
    return () => window.removeEventListener('moecish:open-survey', onOpen);
  }, []);

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
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => setOpen(true)} className="focus-ring rounded-full text-left" title={status.hint}>
        <Chip size="sm" tone={status.tone} dot>
          <span className="inline-flex items-center gap-1">
            {statusIcon(status.tone)}事前場次調查 · {status.label}
          </span>
        </Chip>
      </button>
      {/* UAT 圖29:主要聯絡(信箱+電話)未填寫完整 → 身分帶警示(點擊同開彈窗補填) */}
      {data.contactIncomplete && (
        <button type="button" onClick={() => setOpen(true)} className="focus-ring rounded-full text-left" title="請於聯絡資訊填寫並儲存主要電子郵件與聯絡電話">
          <Chip size="sm" tone="danger" dot>聯絡資訊未填寫完整</Chip>
        </button>
      )}
    </span>
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
