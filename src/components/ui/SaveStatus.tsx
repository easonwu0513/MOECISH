import { Check } from '../icons';
import { cn } from '@/lib/cn';

/**
 * 行內存檔狀態 — 統一各 inline 編輯器的「未存 / 儲存中 / 已儲存」訊號。
 * dirty = w-1.5 琥珀點(去 animate-pulse,玩具感對政府場域過強);
 * saved = 綠勾 + fade-in + aria-live(建立信任的微確認,Linear/Notion 範式)。
 */
type State = 'idle' | 'dirty' | 'saving' | 'saved';

export function SaveStatus({
  state,
  dirtyLabel = '未儲存',
  savingLabel = '儲存中…',
  savedLabel = '已儲存',
  className,
}: {
  state: State;
  dirtyLabel?: string;
  savingLabel?: string;
  savedLabel?: string;
  className?: string;
}) {
  if (state === 'idle') return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-caption', className)} aria-live="polite">
      {state === 'dirty' && (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-warning-500 shrink-0" aria-hidden />
          <span className="text-warning-700">{dirtyLabel}</span>
        </>
      )}
      {state === 'saving' && <span className="text-ink-500">{savingLabel}</span>}
      {state === 'saved' && (
        <span className="inline-flex items-center gap-1 text-success-700 animate-fade-in">
          <Check size={13} className="shrink-0" />
          {savedLabel}
        </span>
      )}
    </span>
  );
}
