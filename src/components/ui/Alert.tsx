import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/tone';

/**
 * 語意提示橫幅 — 收斂全站手刻的 callout/banner(原本 5 種描邊權重並存,讀者無法靠深淺判層級)。
 * Tone 型別取自 lib/tone 單一來源(批72);class 為 Alert 專屬變體(soft 去 ring 前綴、全域另加 ring-1 ring-inset)。
 */
const tones: Record<Tone, string> = {
  neutral: 'bg-paper-sunk text-ink-900 ring-rule',
  primary: 'bg-primary-50 text-primary-800 ring-primary-200',
  sage: 'bg-sage-50 text-sage-800 ring-sage-200',
  success: 'bg-success-50 text-success-700 ring-success-200',
  warning: 'bg-warning-50 text-warning-700 ring-warning-200',
  danger: 'bg-danger-50 text-danger-700 ring-danger-200',
};

type Props = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
  title?: ReactNode;
  icon?: ReactNode;
  /** 右側動作(連結/按鈕) */
  actions?: ReactNode;
};

export function Alert({ tone = 'neutral', title, icon, actions, className, children, ...rest }: Props) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-md px-3.5 py-2.5 text-body-sm ring-1 ring-inset animate-fade-in',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children != null && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
