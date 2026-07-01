'use client';

import { memo, useMemo, type DragEvent } from 'react';
import { findingFormatError, toFullWidth, type Category, type Finding, type SectionKey } from './lib';

export type FindingUpdateValue = string | boolean;

/** 單筆稽核發現編輯列:編號 + 內文 + 換頁/刪除,含格式防呆與重疊警示。 */
export const FindingItem = memo(function FindingItem({
  item,
  cat,
  sec,
  index,
  isDuplicate,
  onUpdate,
  onRemove,
  onFocus,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  item: Finding;
  cat: Category;
  sec: SectionKey;
  index: number;
  isDuplicate: boolean;
  onUpdate: (cat: Category, sec: SectionKey, id: string, field: keyof Finding, value: FindingUpdateValue) => void;
  onRemove: (cat: Category, sec: SectionKey, id: string) => void;
  onFocus: (id: string | null, field?: 'text' | 'code', pos?: number | null) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, cat: Category, sec: SectionKey, index: number) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, cat: Category, sec: SectionKey, index: number) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, cat: Category, sec: SectionKey, index: number) => void;
}) {
  const handleChangeText = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // 中文輸入法組字中(isComposing)不即時正規化,避免改寫受控 value 拆掉組字/跳掉選字視窗;
    // 待上屏(非組字的 onChange)或 onCompositionEnd 才套標點全形化。
    const composing = (e.nativeEvent as { isComposing?: boolean }).isComposing;
    const val = composing ? e.target.value : toFullWidth(e.target.value);
    onUpdate(cat, sec, item.id, 'text', val);
    onFocus(item.id, 'text', e.target.selectionStart);
  };

  const handleCompositionEndText = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    const val = toFullWidth(e.currentTarget.value);
    onUpdate(cat, sec, item.id, 'text', val);
    onFocus(item.id, 'text', e.currentTarget.selectionStart);
  };

  const handleSelectText = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    onFocus(item.id, 'text', e.currentTarget.selectionStart);
  };

  const handleSelectCode = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    onFocus(item.id, 'code', e.currentTarget.selectionStart);
  };

  const togglePageBreak = () => {
    onUpdate(cat, sec, item.id, 'pageBreakBefore', !item.pageBreakBefore);
  };

  const formatError = useMemo(() => findingFormatError(item.code), [item.code]);

  const dynamicWidth = item.code && item.code.length > 5 ? `max(6rem, ${item.code.length + 3}ch)` : '6rem';
  const showOrangeWarning = isDuplicate && !item.duplicateAcknowledged && !formatError;

  return (
    <div
      className={`relative flex flex-wrap sm:flex-nowrap gap-3 items-start mb-5 p-4 finding-row ${item.pageBreakBefore ? 'mt-8 border-primary-300' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, cat, sec, index)}
      onDragOver={(e) => onDragOver(e, cat, sec, index)}
      onDrop={(e) => onDrop(e, cat, sec, index)}
    >
      {item.pageBreakBefore && (
        <div className="custom-page-break-indicator">
          <span className="custom-page-break-label">✂ 此項之前強制換頁</span>
        </div>
      )}

      <div className="flex flex-col items-center justify-center pt-2 cursor-grab text-slate-300 hover:text-slate-500 transition-colors shrink-0" title="拖曳以手動排序">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" /></svg>
      </div>

      <div className="flex flex-col gap-1 shrink-0 transition-all duration-200" style={{ width: dynamicWidth, maxWidth: '100%' }}>
        <textarea
          id={`code-${item.id}`}
          className={`input-elegant w-full font-mono text-center resize-none overflow-hidden leading-relaxed min-w-0 ${formatError ? 'border-red-500 bg-red-50 text-red-900 duplicate-warning-high' : showOrangeWarning ? 'border-orange-400 bg-orange-50 text-orange-900' : ''}`}
          placeholder="編號"
          value={item.code}
          rows={1}
          style={{ minHeight: '42px' }}
          onChange={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
            onUpdate(cat, sec, item.id, 'code', e.target.value);
            if (item.duplicateAcknowledged) {
              onUpdate(cat, sec, item.id, 'duplicateAcknowledged', false);
            }
          }}
          onFocus={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
            handleSelectCode(e);
          }}
          onClick={handleSelectCode}
          onKeyUp={handleSelectCode}
          onBlur={() => onFocus(item.id, 'code', null)}
          onKeyDown={(e) => {
            // 快捷:在編號框按 'o' 即插入「、OT-」前綴
            if (e.key.toLowerCase() === 'o') {
              e.preventDefault();
              const target = e.currentTarget;
              const val = target.value;
              const start = target.selectionStart ?? val.length;
              const end = target.selectionEnd ?? val.length;
              const before = val.substring(0, start);
              const appendStr = before && !before.endsWith('、') ? '、OT-' : 'OT-';
              const newCode = before + appendStr + val.substring(end);
              onUpdate(cat, sec, item.id, 'code', newCode);
              setTimeout(() => {
                const el = document.getElementById(`code-${item.id}`) as HTMLTextAreaElement | null;
                if (el) {
                  el.focus();
                  el.setSelectionRange(start + appendStr.length, start + appendStr.length);
                  el.style.height = 'auto';
                  el.style.height = el.scrollHeight + 'px';
                }
              }, 0);
            }
          }}
          title={formatError || (isDuplicate ? '提示：此編號與其他項目有重疊，請確認是否需整併' : '')}
        />

        <button
          onClick={() => {
            const val = item.code || '';
            const appendStr = val && !val.endsWith('、') ? '、OT-' : 'OT-';
            const newCode = val + appendStr;
            onUpdate(cat, sec, item.id, 'code', newCode);
            setTimeout(() => {
              const el = document.getElementById(`code-${item.id}`) as HTMLTextAreaElement | null;
              if (el) {
                el.focus();
                el.setSelectionRange(newCode.length, newCode.length);
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
              }
            }, 0);
          }}
          className="text-[10px] bg-slate-100 text-slate-500 hover:bg-primary-100 hover:text-primary-700 py-0.5 rounded font-bold transition-colors shadow-sm border border-slate-200 mt-0.5"
          title="快速插入 OT- (快捷鍵：在編號框內按鍵盤 'o')"
        >
          + OT-
        </button>

        {formatError ? (
          <span className="text-[10px] text-red-600 font-bold px-1 animate-pulse text-center">🚨 {formatError}</span>
        ) : isDuplicate ? (
          <div className="flex flex-col items-center gap-1 mt-0.5">
            <span className="text-[10px] text-orange-600 font-bold px-1 text-center">⚠️整併確認</span>
            <label className="text-[10px] text-slate-500 flex items-center justify-center gap-1 cursor-pointer hover:text-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={item.duplicateAcknowledged || false}
                onChange={(e) => onUpdate(cat, sec, item.id, 'duplicateAcknowledged', e.target.checked)}
                className="accent-orange-500 w-3 h-3 cursor-pointer"
              />
              確認不整併
            </label>
          </div>
        ) : null}
      </div>

      <textarea
        id={`textarea-${item.id}`}
        className="input-elegant flex-1 min-w-0 min-h-[90px] resize-y"
        placeholder="請貼入委員的稽核發現內容... (若涉及系統類別可於結尾加註（IT、OT類）)"
        value={item.text}
        onChange={handleChangeText}
        onCompositionEnd={handleCompositionEndText}
        onFocus={handleSelectText}
        onClick={handleSelectText}
        onKeyUp={handleSelectText}
        onBlur={() => onFocus(item.id, 'text', null)}
      />

      <div className="flex sm:flex-col flex-row gap-1 sm:border-l sm:pl-2 sm:border-t-0 border-t pt-2 sm:pt-0 border-slate-100 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
        <button onClick={togglePageBreak} className={`p-1.5 rounded transition-colors flex items-center gap-1 text-xs ${item.pageBreakBefore ? 'bg-primary-100 text-primary-600 hover:bg-primary-200' : 'text-slate-400 hover:text-primary-500 hover:bg-slate-100'}`} title={item.pageBreakBefore ? '取消換頁' : '在此項目之前插入換頁線'}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          <span className="sm:hidden font-bold">換頁線</span>
        </button>
        <button onClick={() => onRemove(cat, sec, item.id)} className="p-1.5 text-red-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors flex items-center gap-1 text-xs" title="刪除項目">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          <span className="sm:hidden font-bold">刪除</span>
        </button>
      </div>
    </div>
  );
});
