'use client';

import { useId, useState, type ReactNode } from 'react';
import { NoteBox } from '@/components/cycle/NoteBox';
import { LawBasisText } from '@/components/checklist/LawBasis';
import { ChevronDown } from '@/components/icons';
import { cn } from '@/lib/cn';

/**
 * 審閱題卡的「意見工作台」外框(UAT 圖78)。
 * 原本委員意見編輯框與稽核依據面板左右並排:稽核依據常駐展開,收合時整排只剩一顆
 * 「新增意見」鈕對著一大塊法條面板,版面失衡。改比照作答盒(AnswerNoteWithLaw)的
 * 紅框設計:意見區也是一個 NoteBox,標題列右側放「稽核依據」展開鈕,法條收在盒內
 * 分隔線下——預設收合,按「新增意見」時自動展開(撰寫時法條仍在同一視野)。
 * children 傳函式可拿到 openBasis(新增鈕觸發自動展開);傳節點/不傳(emptyHint)亦可。
 */
export function CommentWorkbench({
  label,
  auditBasis,
  emptyHint,
  children,
}: {
  label: string;
  /** 稽核依據逐字法條;null=本題無,不顯示展開鈕 */
  auditBasis: string | null;
  /** 無 children 時顯示的說明(如:填報人尚未作答) */
  emptyHint?: string;
  children?: ReactNode | ((api: { openBasis: () => void }) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const body = typeof children === 'function' ? children({ openBasis: () => setOpen(true) }) : children;

  return (
    <NoteBox
      label={label}
      action={
        auditBasis ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            title={open ? '收合稽核依據' : '展開稽核依據'}
            className="shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 min-h-[24px] [@media(pointer:coarse)]:min-h-[44px] text-caption font-medium text-primary-700 hover:bg-primary-50 focus-ring"
          >
            稽核依據
            <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
        ) : undefined
      }
    >
      {body ?? <p className="text-body-sm text-ink-500">{emptyHint}</p>}
      {auditBasis && open && (
        <div id={panelId} className="mt-2.5 border-t border-rule pt-2.5">
          <p className="text-caption font-medium text-primary-800 mb-1.5">稽核依據（相關法規條文・參考）</p>
          {/* 逐字法條篇幅長 → 區內自捲,不把題卡撐爆 */}
          <div className="max-h-72 overflow-y-auto pr-1">
            <LawBasisText text={auditBasis} />
          </div>
        </div>
      )}
    </NoteBox>
  );
}
