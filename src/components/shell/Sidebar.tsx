'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import type { Role } from '@/lib/types';
import { Wordmark } from '../brand/Logo';
import { useNav } from './NavProgress';
import { APP_VERSION, BUILD_REV } from '@/lib/version';
import { sidebarGroups, navIcon } from './nav-map';
import { CycleNavTree } from './CycleNavTree';
import { PreSurveyNavTree } from './PreSurveyNavTree';

/**
 * 靜謐文件工作坊側欄(批 B4)——白卡底 + 髮絲線 + ink 墨字;
 * 當前項以「左緣藍規線 + 淡藍底 + 墨黑字」的文件式標示(取代 M3 深藍藥丸)。
 */
export function Sidebar({
  role,
  userKey,
  collapsed,
  onClose,
  showBrand = true,
}: {
  role: Role;
  /** 使用者識別(email):稽核週期樹的 sessionStorage 快取/展開狀態以此分帳號,防換帳號殘留 */
  userKey: string;
  collapsed?: boolean;
  onClose?: () => void;
  showBrand?: boolean;
}) {
  const pathname = usePathname();
  const nav = useNav();
  const groups = sidebarGroups(role); // 由 nav-map SoT 派生(已依角色過濾)

  return (
    <aside
      className={cn(
        'relative flex flex-col bg-card border-r border-rule transition-all duration-200 ease-standard',
        collapsed ? 'w-20' : 'w-[min(18rem,85vw)]',
      )}
    >
      {showBrand && !collapsed && (
        <div className="h-16 flex items-center px-5 border-b border-rule">
          <Wordmark />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto scrollbar-thin pb-6">
        {groups.map((g, gi) => {
          const items = g.items; // sidebarGroups 已依角色過濾且剔除空組
          return (
            <div key={gi} className="mt-2 first:mt-0">
              {g.label && !collapsed && (
                <div className="px-7 pt-4 pb-2 text-label-sm uppercase tracking-[0.12em] text-ink-500 font-medium">
                  {g.label}
                </div>
              )}
              <ul className="flex flex-col gap-0.5 px-3">
                {items.map((i) => {
                  // 「稽核週期」在展開模式換成階層樹(年度→醫院→工作區,直達目的地);收合模式維持原 icon 列
                  if (i.href === '/cycles' && !collapsed) {
                    return <CycleNavTree key={i.href} role={role} userKey={userKey} onClose={onClose} />;
                  }
                  // 事前場次調查(中心)展開樹:委員 / 觀察員 / 歷年資料(→各年度)
                  if (i.href === '/pre-survey' && !collapsed) {
                    return <PreSurveyNavTree key={i.href} onClose={onClose} />;
                  }
                  const active =
                    pathname === i.href ||
                    (i.href !== '/' && pathname.startsWith(i.href));
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={active ? 'page' : undefined}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                          e.preventDefault();
                          nav.navigate(i.href);
                          onClose?.();
                        }}
                        className={cn(
                          'group relative flex items-center gap-3 h-11 px-4 text-label-lg transition-all duration-200 ease-standard focus-ring rounded-md',
                          active
                            ? 'bg-focus-wash text-ink-900 font-medium shadow-[inset_3px_0_0_var(--rule-active)]'
                            : 'text-ink-500 hover:bg-paper-sunk hover:text-ink-900',
                          collapsed && 'justify-center px-0',
                        )}
                        title={collapsed ? i.label : undefined}
                      >
                        <span
                          className={cn(
                            'transition-colors',
                            active ? 'text-primary-700' : 'text-ink-500 group-hover:text-ink-900',
                          )}
                        >
                          {navIcon(i.iconKey, 20)}
                        </span>
                        {!collapsed && <span>{i.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="px-6 py-4 text-caption text-ink-500 border-t border-rule">
          <span className="font-medium">MOECISH</span> · v{APP_VERSION}
          <span className="tabular-nums"> · {BUILD_REV}</span>
        </div>
      )}
    </aside>
  );
}
