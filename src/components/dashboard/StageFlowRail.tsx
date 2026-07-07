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

/** 精靈範本自訂階段(非七狀態):以「清單完成度」呈現於流程帶,依範本排序插入對應位置 */
export type CustomRailStage = {
  key: string;
  title: string;
  /** 插在哪個標準階段之後(null=最前面);由範本 orderIndex 相對位置推導 */
  afterKey: CycleStatus | null;
  /** 該階段待辦是否全數完成(自訂階段無狀態機語意,以 checklist 完成度呈現) */
  done: boolean;
};

type RailNode =
  | { kind: 'status'; key: CycleStatus }
  | { kind: 'custom'; key: string; title: string; done: boolean };

/**
 * 稽核週期「階段引導流程帶」。
 * 七狀態為狀態機骨幹:走過打勾、當前放大發亮、未來淡化。
 * 精靈範本的「自訂階段」(批62)依範本排序插入其間:虛線節點、以該階段待辦完成度打勾,
 * 不參與狀態機(週期永遠不會「處於」自訂階段),點擊同樣可看該階段待辦。
 */
export function StageFlowRail({
  status,
  className,
  stageHref,
  selectedKey,
  custom,
}: {
  status: CycleStatus;
  className?: string;
  /** 提供時每個階段可點(整格覆蓋連結),點擊跳往該階段(如查看該階段待辦) */
  stageHref?: (s: string) => string;
  /** 目前「檢視中」的階段(與 status 不同時加底色標示),供點擊切換待辦時回饋 */
  selectedKey?: string;
  /** 範本自訂階段(依範本排序插入;無則僅七狀態) */
  custom?: CustomRailStage[];
}) {
  const curIdx = CYCLE_STATUSES.indexOf(status);

  // 組合節點:自訂階段依 afterKey 插入標準階段之後(afterKey null 插最前)
  const customs = custom ?? [];
  const nodes: RailNode[] = [];
  for (const c of customs.filter((c) => c.afterKey === null)) {
    nodes.push({ kind: 'custom', key: c.key, title: c.title, done: c.done });
  }
  for (const s of CYCLE_STATUSES) {
    nodes.push({ kind: 'status', key: s });
    for (const c of customs.filter((c) => c.afterKey === s)) {
      nodes.push({ kind: 'custom', key: c.key, title: c.title, done: c.done });
    }
  }

  // 連接線著色:進入「已到達的標準階段」或「已完成的自訂階段」的線段為綠
  const nodeReached = (n: RailNode): boolean =>
    n.kind === 'status' ? CYCLE_STATUSES.indexOf(n.key) <= curIdx : n.done;

  return (
    <ol
      className={cn(
        'flex items-start overflow-x-auto scrollbar-thin',
        '[mask-image:linear-gradient(to_right,transparent,#000_16px,#000_calc(100%-16px),transparent)] lg:[mask-image:none]',
        className,
      )}
      aria-label="稽核週期階段流程"
    >
      {nodes.map((n, i) => {
        const isSelected = selectedKey === n.key && selectedKey !== status;
        if (n.kind === 'status') {
          const s = n.key;
          const si = CYCLE_STATUSES.indexOf(s);
          const state = si < curIdx ? 'done' : si === curIdx ? 'now' : 'todo';
          const Icon = state === 'done' ? Check : STAGE_ICON[s];
          return (
            <li
              key={n.key}
              className={cn('relative flex-1 min-w-[58px] flex flex-col items-center px-1 py-1 text-center rounded-lg', isSelected && 'bg-primary-50')}
              aria-current={state === 'now' ? 'step' : undefined}
            >
              {i > 0 && (
                <span
                  className={cn('absolute top-5 -left-1/2 w-full h-0.5', nodeReached(n) ? 'bg-success-500' : 'bg-rule')}
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  'relative z-10 rounded-full flex items-center justify-center shrink-0',
                  state === 'now' && 'w-9 h-9 bg-primary-700 text-white ring-4 ring-primary-100',
                  state === 'done' && 'w-8 h-8 bg-success-50 text-success-700 border-2 border-success-500',
                  state === 'todo' && 'w-8 h-8 bg-paper-sunk text-ink-500 border-2 border-rule',
                )}
                aria-hidden
              >
                <Icon size={state === 'now' ? 18 : 14} />
              </span>
              <span
                className={cn(
                  'mt-1.5 text-caption leading-tight whitespace-nowrap',
                  state === 'now' ? 'text-primary-800 font-medium' : 'text-ink-500',
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
        }
        // 自訂階段節點:虛線圈(未完成)/ 綠勾(全數完成);不會是「進行中」(非狀態機)
        return (
          <li
            key={n.key}
            className={cn('relative flex-1 min-w-[58px] flex flex-col items-center px-1 py-1 text-center rounded-lg', isSelected && 'bg-primary-50')}
          >
            {i > 0 && (
              <span
                className={cn('absolute top-5 -left-1/2 w-full h-0.5', nodeReached(n) ? 'bg-success-500' : 'bg-rule')}
                aria-hidden
              />
            )}
            <span
              className={cn(
                'relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                n.done
                  ? 'bg-success-50 text-success-700 border-2 border-success-500'
                  : 'bg-card text-ink-500 border-2 border-dashed border-rule',
              )}
              aria-hidden
            >
              {n.done ? <Check size={14} /> : <span className="h-1.5 w-1.5 rounded-full bg-rule" />}
            </span>
            <span className="mt-1.5 text-caption leading-tight whitespace-nowrap text-ink-500">
              {n.title}
              <span className="sr-only">（清單階段{n.done ? '・已完成' : ''}）</span>
            </span>
            {/* 自訂階段=清單追蹤,非狀態機關卡(UAT:消除「為何不能推進到此」的困惑);虛線+此小標明示無需推進 */}
            <span className="mt-0.5 text-label-sm leading-none text-ink-400">清單階段</span>
            {stageHref && (
              <Link
                href={stageHref(n.key)}
                aria-label={`查看「${n.title}」清單階段的待完成事項(此為清單追蹤階段,非流程關卡,無需推進)`}
                title="清單追蹤階段(非流程關卡);點擊查看待辦,無需推進"
                className="absolute inset-0 z-20 rounded-lg hover:bg-primary-500/[0.06] focus-ring"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
