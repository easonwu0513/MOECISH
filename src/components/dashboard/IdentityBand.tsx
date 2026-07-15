import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * 身分帶(③ 莊重設計系統招牌元件):一眼定位「我是誰、在哪、現在多少待辦」。
 * 頭像 + 標題(姓名/問候)+ 角色徽章 + 範圍 + 右側讀數。各角色工作台與週期頁共用。
 */
export function IdentityBand({
  avatar,
  avatarNode,
  title,
  subtitle,
  extra,
  roleChip,
  right,
  className,
}: {
  avatar?: string;
  /** 自訂頭像節點(如可點擊按鈕);提供時取代預設字元圓 */
  avatarNode?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  /** subtitle 下方額外內容(如事前場次調查狀態徽章) */
  extra?: ReactNode;
  roleChip?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 flex-wrap rounded-lg border border-rule bg-card px-4 py-3.5',
        className,
      )}
    >
      {avatarNode
        ? avatarNode
        : avatar && (
            <div className="w-11 h-11 rounded-full bg-primary-700 text-white flex items-center justify-center text-title-md shrink-0">
              {avatar}
            </div>
          )}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-title-md text-ink-900">{title}</span>
          {roleChip}
        </div>
        {subtitle && <p className="mt-0.5 text-body-sm text-ink-500">{subtitle}</p>}
        {extra && <div className="mt-2">{extra}</div>}
      </div>
      {right && <div className="ml-auto text-right shrink-0">{right}</div>}
    </div>
  );
}
