import type { ComponentType } from 'react';
import Link from 'next/link';
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
export function StageFlowRail({
  status,
  className,
  stageHref,
  selectedKey,
}: {
  status: CycleStatus;
  className?: string;
  /** 提供時每個階段可點(整格覆蓋連結),點擊跳往該階段(如查看該階段待辦) */
  stageHref?: (s: CycleStatus) => string;
  /** 目前「檢視中」的階段(與 status 不同時加底色標示),供點擊切換待辦時回饋 */
  selectedKey?: CycleStatus;
}) {
  const curIdx = CYCLE_STATUSES.indexOf(status);
  return (
    <ol
      className={cn(
        'flex items-start overflow-x-auto scrollbar-thin',
        '[mask-image:linear-gradient(to_right,transparent,#000_16px,#000_calc(100%-16px),transparent)] lg:[mask-image:none]',
        className,
      )}
      aria-label="稽核週期七階段流程"
    >
      {CYCLE_STATUSES.map((s, i) => {
        const state = i < curIdx ? 'done' : i === curIdx ? 'now' : 'todo';
        const Icon = state === 'done' ? Check : STAGE_ICON[s];
        const isSelected = selectedKey === s && selectedKey !== status;
        return (
          <li
            key={s}
            className={cn('relative flex-1 min-w-[58px] flex flex-col items-center px-1 py-1 text-center rounded-lg', isSelected && 'bg-primary-50')}
            aria-current={state === 'now' ? 'step' : undefined}
          >
            {/* 連接線:畫到「前一個節點中心」→「本節點中心」 */}
            {i > 0 && (
              <span
                className={cn('absolute top-5 -left-1/2 w-full h-0.5', i <= curIdx ? 'bg-success-500' : 'bg-outline-variant')}
                aria-hidden
              />
            )}
            <span
              className={cn(
                'relative z-10 rounded-full flex items-center justify-center shrink-0',
                state === 'now' && 'w-9 h-9 bg-primary-700 text-white ring-4 ring-primary-100',
                state === 'done' && 'w-8 h-8 bg-success-50 text-success-700 border-2 border-success-500',
                state === 'todo' && 'w-8 h-8 bg-surface-container text-on-surface-variant border-2 border-outline-variant',
              )}
              aria-hidden
            >
              <Icon size={state === 'now' ? 18 : 14} />
            </span>
            <span
              className={cn(
                'mt-1.5 text-caption leading-tight whitespace-nowrap',
                state === 'now' ? 'text-primary-800 font-medium' : 'text-on-surface-variant',
                state === 'todo' && 'text-on-surface-variant',
              )}
            >
              {CYCLE_STATUS_LABELS[s]}
              <span className="sr-only">（{state === 'done' ? '已完成' : state === 'now' ? '進行中' : '尚未開始'}）</span>
            </span>
            {state === 'now' && (
              <span className="mt-1 text-label-sm text-primary-700 bg-primary-50 rounded-full px-2 leading-5">進行中</span>
            )}
            {stageHref && (
              <Link
                href={stageHref(s)}
                aria-label={`查看「${CYCLE_STATUS_LABELS[s]}」階段的待完成事項`}
                className="absolute inset-0 z-20 rounded-lg hover:bg-primary-500/[0.06] focus-ring"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
