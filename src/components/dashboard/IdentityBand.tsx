import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * 身分帶(③ 莊重設計系統招牌元件):一眼定位「我是誰、在哪、現在多少待辦」。
 * 頭像 + 標題(姓名/問候)+ 角色徽章 + 範圍 + 右側讀數。各角色工作台與週期頁共用。
 */
export function IdentityBand({
  avatar,
  title,
  subtitle,
  roleChip,
  right,
  className,
}: {
  avatar?: string;
  title: string;
  subtitle?: ReactNode;
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
      {avatar && (
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
      </div>
      {right && <div className="ml-auto text-right shrink-0">{right}</div>}
    </div>
  );
}
