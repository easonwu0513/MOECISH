import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { ChevronDown } from '../icons';

/**
 * 篩選列專用的精簡表單控制項(UIUX 稽核 #10)。
 * 後台各頁的篩選列原本各自手抄 `h-9 rounded-md border border-outline-variant bg-surface …`
 * 的 input/select 配方(尺寸/邊框/內距略有漂移)。這裡收斂為元件庫單一來源。
 * 刻意有別於 M3 大型 TextField/Select(那是表單主體用;h-12 填色浮動標籤,放在緊湊篩選列會過重)。
 * 皆為 server 相容(無 hook/ref),可直接放進 method=get 的伺服器表單。
 */

const CONTROL =
  'h-9 rounded-md border border-outline-variant bg-surface px-2.5 text-body-sm text-on-surface ' +
  'transition-colors hover:border-outline focus-ring';

/** 標籤 + 控制項的垂直包裝(小標題在上)。 */
export function FilterField({
  label,
  children,
  className,
}: {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1 text-caption text-on-surface-variant', className)}>
      {label}
      {children}
    </label>
  );
}

export function FilterInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...rest} />;
}

export function FilterSelect({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(CONTROL, 'w-full appearance-none pr-8', className)} {...rest}>
        {children}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant" />
    </div>
  );
}
