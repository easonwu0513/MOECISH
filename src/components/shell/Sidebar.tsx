'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import type { Role } from '@/lib/types';
import { Wordmark } from '../brand/Logo';
import { useNav } from './NavProgress';
import { APP_VERSION, BUILD_REV } from '@/lib/version';
import { sidebarGroups, navIcon } from './nav-map';

/**
 * Material 3 Navigation Drawer.
 * Uses pill-shaped active indicator on primary-container background.
 */
export function Sidebar({
  role,
  collapsed,
  onClose,
  showBrand = true,
}: {
  role: Role;
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
        'relative flex flex-col bg-surface-container-low border-r border-outline-variant/60 transition-all duration-200 ease-standard',
        collapsed ? 'w-20' : 'w-[min(18rem,85vw)]',
      )}
    >
      {showBrand && !collapsed && (
        <div className="h-16 flex items-center px-5 border-b border-outline-variant/50">
          <Wordmark />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto scrollbar-thin pb-6">
        {groups.map((g, gi) => {
          const items = g.items; // sidebarGroups 已依角色過濾且剔除空組
          return (
            <div key={gi} className="mt-2 first:mt-0">
              {g.label && !collapsed && (
                <div className="px-7 py-3 text-label-sm uppercase tracking-[0.08em] text-on-surface-variant font-medium">
                  {g.label}
                </div>
              )}
              <ul className="flex flex-col gap-0.5 px-3">
                {items.map((i) => {
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
                          'group relative flex items-center gap-3 h-14 px-4 text-label-lg transition-all duration-200 ease-standard focus-ring rounded-full',
                          active
                            ? 'bg-primary-container text-on-primary-container font-medium'
                            : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
                          collapsed && 'justify-center px-0',
                        )}
                        title={collapsed ? i.label : undefined}
                      >
                        <span
                          className={cn(
                            'transition-colors',
                            active ? 'text-on-primary-container' : 'text-on-surface-variant group-hover:text-on-surface',
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
        <div className="px-6 py-4 text-caption text-on-surface-variant">
          <span className="font-medium">MOECISH</span> · v{APP_VERSION}
          <span className="tabular-nums"> · {BUILD_REV}</span>
        </div>
      )}
    </aside>
  );
}
