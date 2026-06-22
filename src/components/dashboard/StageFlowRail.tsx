import type { ComponentType } from 'react';
import { cn } from '@/lib/cn';
import { CYCLE_STATUSES, type CycleStatus } from '@/lib/types';
import { CYCLE_STATUS_LABELS } from '@/lib/stage';
import {
  FileText, Upload, ClipboardCheck, Eye, AlertTriangle, AlertCircle, CheckCircle, Check,
} from '../icons';

const STAGE_ICON: Record<CycleStatus, ComponentType<{ size?: number }>> = {
  DRAFT: FileText,
  PREPARATION: Upload,
  READY: ClipboardCheck,
  ONSITE: Eye,
  REPORT_ISSUED: AlertTriangle,
  REMEDIATION: AlertCircle,
  CLOSED: CheckCircle,
};

/**
 * 稽核週期「7 階段引導流程帶」(③ 莊重設計;取代週期頁的 4 步 Stepper)。
 * 走過的階段打勾、當前階段放大發亮(深藍 + ring)、未來階段淡化。
 * 直接由 stage SoT(CYCLE_STATUSES + CYCLE_STATUS_LABELS)驅動,與週期 Chip 同語彙。
 */
export function StageFlowRail({ status, className }: { status: CycleStatus; className?: string }) {
  const curIdx = CYCLE_STATUSES.indexOf(status);
  return (
    <ol className={cn('flex items-start overflow-x-auto scrollbar-thin', className)} aria-label="稽核週期七階段流程">
      {CYCLE_STATUSES.map((s, i) => {
        const state = i < curIdx ? 'done' : i === curIdx ? 'now' : 'todo';
        const Icon = state === 'done' ? Check : STAGE_ICON[s];
        return (
          <li key={s} className="relative flex-1 min-w-[58px] flex flex-col items-center px-1 text-center">
            {/* 連接線:畫到「前一個節點中心」→「本節點中心」 */}
            {i > 0 && (
              <span
                className={cn('absolute top-4 -left-1/2 w-full h-0.5', i <= curIdx ? 'bg-success-500' : 'bg-outline-variant')}
                aria-hidden
              />
            )}
            <span
              className={cn(
                'relative z-10 rounded-full flex items-center justify-center shrink-0',
                state === 'now' && 'w-9 h-9 bg-primary-700 text-white ring-4 ring-primary-100',
                state === 'done' && 'w-8 h-8 bg-success-50 text-success-700 border-2 border-success-500',
                state === 'todo' && 'w-8 h-8 bg-surface text-on-surface-variant border-2 border-outline-variant opacity-60',
              )}
              aria-hidden
            >
              <Icon size={state === 'now' ? 18 : 14} />
            </span>
            <span
              className={cn(
                'mt-1.5 text-caption leading-tight whitespace-nowrap',
                state === 'now' ? 'text-primary-800 font-medium' : 'text-on-surface-variant',
                state === 'todo' && 'opacity-60',
              )}
            >
              {CYCLE_STATUS_LABELS[s]}
            </span>
            {state === 'now' && (
              <span className="mt-1 text-label-sm text-primary-700 bg-primary-50 rounded-full px-2 leading-5">進行中</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
