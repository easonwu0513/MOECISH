'use client';

import { useId, useState } from 'react';
import { NoteBox } from '@/components/cycle/NoteBox';
import { NumberedList } from './LawBasis';
import { ChevronDown } from '@/components/icons';
import { cn } from '@/lib/cn';

/**
 * 委員審閱題卡的「機關作答盒 + 就地法規對照」。
 * UAT:原本稽核重點/應備文件在右欄常駐面板,委員要左右來回對照;改為把對應段落收進
 * 作答盒的標題列鈕——「機關說明」旁開「稽核重點」、「紀錄文件」旁開「應備文件」,
 * 展開即就地顯示於該盒內,對照對象與被對照內容永遠同框。
 * 作答內容一律顯示(未填則明示),法規段落預設收合。
 */
export function AnswerNoteWithLaw({
  label,
  prominent,
  text,
  emptyHint,
  lawLabel,
  lawText,
  className,
}: {
  label: string;
  /** 機關作答主體加重(層1 錨點) */
  prominent?: boolean;
  /** 機關填寫的內容(null/空白=未填) */
  text: string | null;
  /** 未填時顯示的說明 */
  emptyHint: string;
  /** 對照法規段落標題(稽核重點 / 應備文件) */
  lawLabel: string;
  /** 對照法規段落內容;null=本題無此段落,不顯示鈕 */
  lawText: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId(); // 收合鈕 aria-controls 對應展開面板
  const filled = !!text?.trim();

  return (
    <NoteBox
      prominent={prominent}
      label={label}
      className={className}
      action={
        lawText ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            title={open ? `收合${lawLabel}` : `展開${lawLabel}`}
            className="shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 min-h-[24px] [@media(pointer:coarse)]:min-h-[44px] text-caption font-medium text-primary-700 hover:bg-primary-50 focus-ring"
          >
            {lawLabel}
            <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
        ) : undefined
      }
    >
      {filled ? (
        <p
          className={cn(
            'leading-relaxed whitespace-pre-wrap',
            prominent ? 'text-body text-ink-900' : 'text-body-sm text-ink-500',
          )}
        >
          {text}
        </p>
      ) : (
        // ink-500 而非 ink-400:token 註記 ink-400 未達 AA 勿用於文字;此行改一律渲染後每題必現
        <p className="text-body-sm text-ink-500">{emptyHint}</p>
      )}
      {lawText && open && (
        <div id={panelId} className="mt-2.5 border-t border-rule pt-2.5">
          <p className="text-caption font-medium text-primary-800 mb-1.5">{lawLabel}</p>
          <NumberedList text={lawText} />
        </div>
      )}
    </NoteBox>
  );
}
