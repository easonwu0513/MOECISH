import { cn } from '@/lib/cn';
import { Check } from '../icons';
import { PROCESS_STEPS } from '@/lib/process-guide';

/**
 * 稽核流程四步驟進度條(資料準備 → 實地稽核 → 缺失矯正 → 審查結案)。
 * current: 0=籌備中(全未開始)、1–4=該步進行中、5=全部完成。
 */
export function CycleStepper({ current, className }: { current: number; className?: string }) {
  return (
    <ol className={cn('flex items-center', className)} aria-label="稽核流程進度">
      {PROCESS_STEPS.map((s) => {
        const state =
          current >= 5 || s.no < current ? 'done' : s.no === current ? 'now' : 'todo';
        return (
          <li key={s.no} className={cn('flex items-center min-w-0', s.no < 4 && 'flex-1')}>
            <span className="flex items-center gap-1.5 shrink-0">
              <span
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold tabular-nums shrink-0',
                  state === 'done' && 'bg-primary-600 text-white',
                  state === 'now' && 'bg-primary-50 text-primary-700 ring-2 ring-primary-500',
                  state === 'todo' && 'bg-surface-container-high text-on-surface-variant',
                )}
                aria-hidden
              >
                {state === 'done' ? <Check size={11} /> : s.no}
              </span>
              {/* 窄螢幕只留目前步驟的文字,避免四組標籤擠壓換行 */}
              <span
                className={cn(
                  'text-caption whitespace-nowrap',
                  state === 'now' ? 'inline text-primary-700 font-medium' : 'hidden sm:inline',
                  state === 'done' && 'text-on-surface',
                  state === 'todo' && 'text-on-surface-variant',
                )}
              >
                {s.title}
              </span>
            </span>
            {s.no < 4 && (
              <span
                className={cn(
                  'mx-2 h-px flex-1 min-w-3',
                  current >= 5 || s.no < current ? 'bg-primary-300' : 'bg-outline-variant',
                )}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
