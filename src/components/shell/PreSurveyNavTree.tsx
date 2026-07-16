'use client';

import Link from 'next/link';
import { useEffect, useState, type MouseEvent } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useNav } from './NavProgress';
import { navIcon } from './nav-map';
import { ChevronRight, Users, History } from '../icons';

/**
 * 側欄「事前場次調查」展開樹(UAT):委員 / 觀察員 / 歷年資料(→各年度)。
 * 僅中心可見(Sidebar 對此路由 sidebarAllow=ADMIN)。年度以 /api/nav/presurvey-years 取得(mount 後),
 * 首繪(SSR/hydration)一律不含年度以免不一致;主連結一律可用,fetch 失敗僅歷年清單不顯示。
 */
export function PreSurveyNavTree({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nav = useNav();
  const [years, setYears] = useState<number[] | null>(null);
  const [rootOpen, setRootOpen] = useState(true);
  const [histOpen, setHistOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/nav/presurvey-years')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { years: number[] } | null) => { if (!cancelled && j) setYears(j.years); })
      .catch(() => { /* 失敗靜默:歷年清單不顯示,主連結照常可用 */ });
    return () => { cancelled = true; };
  }, []);

  const onPreSurvey = pathname === '/pre-survey';
  const curKind = searchParams.get('kind') === 'OBSERVER' ? 'OBSERVER' : 'MEMBER';
  const curYear = searchParams.get('year');
  const currentYear = new Date().getFullYear();
  const pastYears = (years ?? []).filter((y) => y !== currentYear);

  function go(e: MouseEvent, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    nav.navigate(href);
    onClose?.();
  }

  const subCls = (active: boolean) =>
    cn(
      'flex items-center gap-2 h-9 pl-11 pr-3 text-label rounded-md transition-colors focus-ring',
      active ? 'text-ink-900 font-medium bg-focus-wash' : 'text-ink-500 hover:bg-paper-sunk hover:text-ink-900',
    );

  return (
    <li>
      {/* 事前場次調查(可展開) */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setRootOpen((o) => !o)}
          className="shrink-0 p-1 text-ink-400 hover:text-ink-700 focus-ring rounded"
          aria-label={rootOpen ? '收合事前場次調查' : '展開事前場次調查'}
          aria-expanded={rootOpen}
        >
          <ChevronRight size={14} className={cn('transition-transform', rootOpen && 'rotate-90')} />
        </button>
        <Link
          href="/pre-survey"
          onClick={(e) => go(e, '/pre-survey')}
          aria-current={onPreSurvey && !curYear && !searchParams.get('kind') ? 'page' : undefined}
          className={cn(
            'group flex flex-1 items-center gap-3 h-11 px-2 text-label-lg rounded-md transition-all focus-ring',
            onPreSurvey && !curYear
              ? 'bg-focus-wash text-ink-900 font-medium shadow-[inset_3px_0_0_var(--rule-active)]'
              : 'text-ink-500 hover:bg-paper-sunk hover:text-ink-900',
          )}
        >
          <span className={cn(onPreSurvey ? 'text-primary-700' : 'text-ink-500 group-hover:text-ink-900')}>
            {navIcon('presurvey', 20)}
          </span>
          <span>事前場次調查</span>
        </Link>
      </div>

      {rootOpen && (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          <li>
            <Link href="/pre-survey?kind=MEMBER" onClick={(e) => go(e, '/pre-survey?kind=MEMBER')} className={subCls(onPreSurvey && !curYear && curKind === 'MEMBER')}>
              <Users size={15} className="shrink-0" /> 委員
            </Link>
          </li>
          <li>
            <Link href="/pre-survey?kind=OBSERVER" onClick={(e) => go(e, '/pre-survey?kind=OBSERVER')} className={subCls(onPreSurvey && !curYear && curKind === 'OBSERVER')}>
              <Users size={15} className="shrink-0" /> 觀察員
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setHistOpen((o) => !o)}
              className={cn(subCls(false), 'w-full text-left')}
              aria-expanded={histOpen}
            >
              <ChevronRight size={13} className={cn('shrink-0 transition-transform', histOpen && 'rotate-90')} />
              <History size={15} className="shrink-0" /> 歷年資料
            </button>
            {histOpen && (
              <ul className="flex flex-col gap-0.5">
                {years === null ? (
                  <li className="pl-[4.5rem] py-1 text-caption text-ink-400">載入中…</li>
                ) : pastYears.length === 0 ? (
                  <li className="pl-[4.5rem] py-1 text-caption text-ink-400">無歷年資料</li>
                ) : (
                  pastYears.map((y) => (
                    <li key={y}>
                      <Link
                        href={`/pre-survey?year=${y}`}
                        onClick={(e) => go(e, `/pre-survey?year=${y}`)}
                        className={cn(
                          'flex items-center h-8 pl-[4.5rem] pr-3 text-caption rounded-md focus-ring',
                          curYear === String(y) ? 'text-ink-900 font-medium bg-focus-wash' : 'text-ink-500 hover:bg-paper-sunk hover:text-ink-900',
                        )}
                      >
                        {y - 1911} 年度
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            )}
          </li>
        </ul>
      )}
    </li>
  );
}
