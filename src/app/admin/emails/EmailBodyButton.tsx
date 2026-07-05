'use client';

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { FileText } from '@/components/icons';

/**
 * 郵件內文檢視(設計精緻化;批88)。原本內文塞在表格「主旨」格內的 <details>,
 * 撐高列高、與密集表格衝突。改為每列一個「檢視內文」鈕,於側板(Sheet)完整呈現
 * 收件者/寄送時間/主旨/內文——表格回歸緊湊(得以套 density=compact)。
 */
export function EmailBodyButton({
  subject,
  body,
  to,
  sentAt,
}: {
  subject: string;
  body: string;
  to: string;
  sentAt: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 text-caption text-on-surface-variant hover:text-primary-700 focus-ring rounded transition-colors"
      >
        <FileText size={13} />
        檢視內文
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="郵件內文" width="lg">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-body-sm">
            <span className="text-caption text-on-surface-variant pt-0.5">收件者</span>
            <span className="text-on-surface break-words">{to}</span>
            <span className="text-caption text-on-surface-variant pt-0.5">寄送</span>
            <span className="text-on-surface tabular-nums">{sentAt}</span>
            <span className="text-caption text-on-surface-variant pt-0.5">主旨</span>
            <span className="text-on-surface font-medium break-words">{subject}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-on-surface-variant">內文</span>
            <pre className="p-4 bg-surface-container-lowest border border-outline-variant/60 rounded-md whitespace-pre-wrap font-sans text-body-sm text-on-surface leading-relaxed">{body}</pre>
          </div>
        </div>
      </Sheet>
    </>
  );
}
