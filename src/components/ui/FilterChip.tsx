import Link from 'next/link';
import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * 可選取的篩選膠囊(統一全站手刻的 filter chip:
 * 檢核表篩選、缺失狀態 tabs、管理週期年度、追蹤信機關選擇)。
 * - selected:primary 實底白字
 * - 一般:surface 底 + outline,hover 提升
 */
const base =
  'inline-flex items-center gap-1.5 h-9 px-4 rounded-full border text-body-sm transition-colors duration-200 ease-standard focus-ring whitespace-nowrap';

function chipClass(selected: boolean) {
  return cn(
    base,
    selected
      ? 'bg-primary-600 text-white border-primary-600'
      : 'bg-surface text-on-surface-variant border-outline-variant hover:border-outline hover:text-on-surface',
  );
}

/** 連結版(server component 可用,篩選靠 URL) */
export function FilterChipLink({
  href,
  selected,
  children,
  className,
}: {
  href: string;
  selected: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(chipClass(selected), className)} aria-current={selected ? 'true' : undefined}>
      {children}
    </Link>
  );
}

/** 按鈕版(client 狀態篩選) */
export function FilterChipButton({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button type="button" onClick={onClick} className={cn(chipClass(selected), className)} aria-pressed={selected}>
      {children}
    </button>
  );
}

/** 件數徽記(放在 chip 文字後) */
export function FilterChipCount({ selected, children }: { selected: boolean; children: ReactNode }) {
  return <span className={cn('tabular-nums', selected ? 'text-primary-100' : 'text-on-surface-variant')}>{children}</span>;
}
