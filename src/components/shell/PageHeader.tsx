import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * 頁面標題區骨架 — 統一散落各頁的手刻 header。
 * 固定版型:mb-6、兩欄(標題群 / 動作),h1 text-headline、副標 body-sm。
 * 不含 backHref —— AppShell 內頁已有 Breadcrumbs,返回導覽不重複造輪子。
 */
export function PageHeader({
  title,
  subtitle,
  chips,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** 與標題同列的狀態 chip 等 */
  chips?: ReactNode;
  /** 右側動作區(按鈕/面板) */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6 flex items-start justify-between gap-4 flex-wrap', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-headline text-on-surface">{title}</h1>
          {chips}
        </div>
        {subtitle && (
          <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex gap-2 flex-wrap shrink-0">{actions}</div>}
    </header>
  );
}
