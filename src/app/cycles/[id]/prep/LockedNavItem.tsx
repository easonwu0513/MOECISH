'use client';

import type { ReactNode } from 'react';
import { useToast } from '@/components/ui/Toast';

/**
 * 稽核作業項目導覽:尚未開放的項目(如委員在資料齊備階段點「實地稽核評分」)。
 * 點擊時不導覽(避免落到目標頁被 redirect 回總覽而失去當前頁),改就地跳提醒 toast 告知尚未開放。
 */
export default function LockedNavItem({
  children,
  title,
  message,
}: {
  children: ReactNode;
  title: string;
  message: string;
}) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => toast.info(title, message)}
      aria-disabled
      className="group block w-full text-left rounded-md focus-ring cursor-not-allowed"
    >
      {children}
    </button>
  );
}
