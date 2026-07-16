'use client';

import { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Upload } from '../icons';

/**
 * 鍵盤可及的檔案上傳鈕。
 * 原本各頁用 <label> 包 class="hidden" 的 input — 整個入口無法 Tab/Enter;
 * 改 sr-only(input 仍可聚焦)+ focus-within 顯示焦點環。
 */
export function FileUploadButton({
  label,
  busyLabel = '上傳中…',
  busy,
  size = 'md',
  className,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: ReactNode;
  busyLabel?: string;
  busy?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 rounded-md bg-card border border-dashed border-primary-400 text-primary-700',
        'hover:bg-primary-50 cursor-pointer transition-colors duration-200 ease-standard',
        'focus-within:ring-2 focus-within:ring-primary-500/60 focus-within:ring-offset-2 focus-within:ring-offset-card',
        size === 'sm' ? 'h-9 px-3' : 'h-10 px-4',
        busy && 'opacity-60 cursor-wait',
        className,
      )}
    >
      <input type="file" className="sr-only" disabled={busy} {...inputProps} />
      <Upload size={14} />
      <span className="text-body-sm">{busy ? busyLabel : label}</span>
    </label>
  );
}
