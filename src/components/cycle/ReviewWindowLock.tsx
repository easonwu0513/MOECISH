import { Card } from '@/components/ui/Card';
import { EyeOff } from '@/components/icons';
import { fmtROCDateTime } from '@/lib/date';
import type { ReviewWindowState } from '@/lib/types';
import RequestReviewWindowButton from '@/components/cycle/RequestReviewWindowButton';

/**
 * 委員審閱時間區間鎖定提示(UAT 批67):委員在階段已開放、但不在中心設定的審閱時段內時,
 * 資料準備 / 檢核表審閱頁改顯此鎖定卡(而非直接導回),讓委員知道「為何不能看、何時能看」。
 */
export function ReviewWindowLockNotice({
  state,
  start,
  end,
  stageEnded = false,
  cycleId,
}: {
  state: ReviewWindowState; // 'before' | 'after' | 'unset'(open 不會渲染此元件)
  start: Date | string | null;
  end: Date | string | null;
  /** 實地稽核階段已結束(缺失發布起):優先顯示「稽核已結束」而非「未設定/尚未開始」(UAT 批69,合乎階段情境) */
  stageEnded?: boolean;
  /** 提供時,於「未設定」情境顯示「一鍵請中心設定審閱時段」按鈕(委員自救)。 */
  cycleId?: string;
}) {
  const msg = stageEnded
    ? '實地稽核階段已結束,已不在委員審閱時段,不再開放檢視機關資料;如需再次檢視,請洽中心。'
    : state === 'before'
      ? `委員審閱時段為 ${fmtROCDateTime(start)} 起;目前尚未開始,暫不開放檢視機關資料。`
      : state === 'after'
        ? `委員審閱時段至 ${fmtROCDateTime(end)} 止;審閱期已結束,不再開放檢視機關資料。`
        // 未設定:明示「非您之過」,並給一鍵自救,避免委員被靜默鎖在門外不知找誰(五鏡稽核 P0)
        : '審閱時段尚未由中心設定,因此暫未開放檢視——這不是您的操作問題。您可一鍵通知中心盡快設定審閱時段。';
  const title = stageEnded ? '非委員審閱時段' : state === 'after' ? '審閱期已結束' : state === 'before' ? '審閱尚未開始' : '審閱尚未開放';
  const showRequest = !stageEnded && state === 'unset' && !!cycleId;
  return (
    <Card variant="outlined">
      <div className="flex flex-col items-center text-center gap-3 py-12 px-6">
        <div className="w-14 h-14 rounded-full bg-paper-sunk flex items-center justify-center text-ink-500" aria-hidden>
          <EyeOff size={28} />
        </div>
        <p className="text-title-md text-ink-900">{title}</p>
        <p className="text-body-sm text-ink-500 max-w-md leading-relaxed">{msg}</p>
        {state !== 'unset' && start && end && (
          <p className="text-caption text-ink-500 tabular-nums">
            審閱時段:{fmtROCDateTime(start)} ～ {fmtROCDateTime(end)}
          </p>
        )}
        {showRequest && <div className="mt-1"><RequestReviewWindowButton cycleId={cycleId as string} /></div>}
      </div>
    </Card>
  );
}
