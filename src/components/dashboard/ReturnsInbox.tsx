import Link from 'next/link';
import { AlertTriangle, ChevronRight } from '@/components/icons';
import { Chip } from '@/components/ui/Chip';
import { fmtROC } from '@/lib/date';
import { RETURN_KIND_LABEL, type ReturnItem } from '@/lib/returns';

/**
 * 退回收件匣(重塑 R2 / W4):把散落各頁的「退回待補正」收斂為單一區塊。
 * 每列一鍵直達該項補正頁。showOrg=true(中心)時顯示機關名;機關自身檢視則省略(單一機關不贅述)。
 */
export function ReturnsInbox({ items, showOrg }: { items: ReturnItem[]; showOrg: boolean }) {
  if (items.length === 0) return null;

  return (
    <section className="mb-6 rounded-lg border border-warning-200 bg-card shadow-elev-1 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-warning-200 bg-warning-50">
        <p className="inline-flex items-center gap-2 text-title text-warning-700">
          <AlertTriangle size={16} aria-hidden />
          退回待補正 · {items.length} 件
        </p>
        <span className="text-caption text-ink-500">
          {showOrg ? '以下項目經退回，仍待機關補正後重新送出。' : '以下項目經退回，請依意見補正後重新送出。'}
        </span>
      </div>
      <ul className="divide-y divide-rule">
        {items.map((it) => (
          <li key={it.id}>
            <Link
              href={it.href}
              className="group flex items-start gap-3 px-4 py-3 hover:bg-paper-sunk focus-ring transition-colors"
            >
              <span className="mt-0.5 shrink-0">
                <Chip tone="warning" size="sm">{RETURN_KIND_LABEL[it.kind]}</Chip>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-body-sm font-medium text-ink-900 truncate">{it.title}</span>
                  <span className="text-caption text-ink-500 tabular-nums">
                    {showOrg ? `${it.orgName} · ${it.yearROC} 年度` : `${it.yearROC} 年度`}
                    {it.returnedAt && ` · 退回於 ${fmtROC(it.returnedAt)}`}
                  </span>
                </div>
                {it.reason && (
                  <p className="mt-0.5 text-caption text-ink-700 line-clamp-2 leading-relaxed">{it.reason}</p>
                )}
              </div>
              {/* P1:中心視角看的是「全機關退件」,補正的是機關不是中心 → CTA 依角色分述 */}
              <span className="shrink-0 self-center inline-flex items-center gap-0.5 text-label-lg font-medium text-primary-700">
                {showOrg ? '查看' : '前往補正'}
                <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
