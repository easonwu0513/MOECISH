import Link from 'next/link';
import { Check, ChevronRight } from '@/components/icons';
import { cn } from '@/lib/cn';
import type { DocumentChapter, ChapterStatus } from '@/lib/document-progress';

/**
 * 七章文件進度尺(重塑 R4 / W2)—— 機關週期首頁的單一導覽 + 進度來源,取代散落的 4 張 StatusTile。
 * 章節資料由 lib/document-progress.deriveDocumentChapters(SoT)派生。
 * 段落聚焦:當前(active)章節以 border-rule-active + bg-focus-wash 加亮「當前」,其餘不壓暗(不降透明度)。
 */

function StepDot({ status, index }: { status: ChapterStatus; index: number }) {
  const base = 'relative z-[1] grid place-items-center w-7 h-7 rounded-full text-caption font-semibold tabular-nums shrink-0';
  if (status === 'done') {
    return (
      <span className={cn(base, 'bg-success-600 text-white')} aria-hidden>
        <Check size={15} />
      </span>
    );
  }
  if (status === 'active') {
    return <span className={cn(base, 'bg-focus-wash text-primary-700 ring-2 ring-rule-active')}>{index}</span>;
  }
  // todo / locked:中性圈(locked 另以說明文字表達鎖定,不再減弱對比破 AA)
  return <span className={cn(base, 'bg-paper-sunk text-ink-500 ring-1 ring-rule')}>{index}</span>;
}

const STATUS_TAG: Partial<Record<ChapterStatus, { text: string; cls: string }>> = {
  active: { text: '進行中', cls: 'text-primary-700' },
  done: { text: '已完成', cls: 'text-success-700' },
  locked: { text: '未開放', cls: 'text-ink-500' },
};

export function DocumentProgressRail({ chapters }: { chapters: DocumentChapter[] }) {
  const doneCount = chapters.filter((c) => c.status === 'done').length;
  const pct = chapters.length > 0 ? Math.round((doneCount / chapters.length) * 100) : 0;

  return (
    <section className="mb-6 rounded-lg border border-rule bg-card overflow-hidden" aria-label="稽核文件進度尺">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-rule">
        <div>
          <p className="text-title-md text-ink-900">稽核文件進度</p>
          <p className="text-caption text-ink-500 mt-0.5">機關本年度需辦理的七個文件章節,依序辦理、隨時掌握現況</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-headline text-ink-900 tabular-nums leading-none">{pct}%</p>
          <p className="text-caption text-ink-500 mt-1 tabular-nums">{doneCount}/{chapters.length} 章完成</p>
        </div>
      </div>

      <ol>
        {chapters.map((c, i) => {
          const isLast = i === chapters.length - 1;
          const active = c.status === 'active';
          const tag = STATUS_TAG[c.status];
          const inner = (
            <div className="flex gap-3 px-4 py-3">
              {/* 進度尺軌:圓點 + 連接線 */}
              <div className="flex flex-col items-center self-stretch">
                <StepDot status={c.status} index={c.index} />
                {!isLast && <span className="w-px flex-1 bg-rule mt-1" aria-hidden />}
              </div>
              {/* 內容 */}
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-caption text-ink-500 tabular-nums shrink-0">第 {c.index} 章</span>
                    <span className={cn('text-body-sm font-medium truncate', c.status === 'locked' ? 'text-ink-500' : 'text-ink-900')}>
                      {c.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {tag && <span className={cn('text-caption font-medium', tag.cls)}>{tag.text}</span>}
                    {c.href && <ChevronRight size={15} className="text-ink-500 transition-transform group-hover:translate-x-0.5" aria-hidden />}
                  </div>
                </div>
                <p className="text-caption text-ink-500 mt-0.5 leading-relaxed">
                  {c.status === 'locked' && c.lockedHint ? c.lockedHint : c.detail}
                </p>
              </div>
            </div>
          );

          return (
            <li key={c.key} className={cn('border-l-2 border-transparent', active && 'border-rule-active bg-focus-wash')}>
              {c.href ? (
                <Link href={c.href} className="group block hover:bg-paper-sunk focus-ring transition-colors">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
