import { Card } from '@/components/ui/Card';
import { EyeOff } from '@/components/icons';
import { fmtROCDateTime } from '@/lib/date';
import type { ReviewWindowState } from '@/lib/types';

/**
 * 委員審閱時間區間鎖定提示(UAT 批67):委員在階段已開放、但不在中心設定的審閱時段內時,
 * 資料準備 / 檢核表審閱頁改顯此鎖定卡(而非直接導回),讓委員知道「為何不能看、何時能看」。
 */
export function ReviewWindowLockNotice({
  state,
  start,
  end,
}: {
  state: ReviewWindowState; // 'before' | 'after' | 'unset'(open 不會渲染此元件)
  start: Date | string | null;
  end: Date | string | null;
}) {
  const msg =
    state === 'before'
      ? `委員審閱時段為 ${fmtROCDateTime(start)} 起;目前尚未開始,暫不開放檢視機關資料。`
      : state === 'after'
        ? `委員審閱時段至 ${fmtROCDateTime(end)} 止;審閱期已結束,不再開放檢視機關資料。`
        : '中心尚未設定委員審閱時間區間,暫未開放檢視機關資料;請洽中心設定審閱時段。';
  const title = state === 'after' ? '審閱期已結束' : state === 'before' ? '審閱尚未開始' : '審閱尚未開放';
  return (
    <Card variant="outlined">
      <div className="flex flex-col items-center text-center gap-3 py-12 px-6">
        <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant" aria-hidden>
          <EyeOff size={28} />
        </div>
        <p className="text-title-md text-on-surface">{title}</p>
        <p className="text-body-sm text-on-surface-variant max-w-md leading-relaxed">{msg}</p>
        {state !== 'unset' && start && end && (
          <p className="text-caption text-on-surface-variant/80 tabular-nums">
            審閱時段:{fmtROCDateTime(start)} ～ {fmtROCDateTime(end)}
          </p>
        )}
      </div>
    </Card>
  );
}
