'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import {
  LayoutDashboard,
  ClipboardCheck,
  AlertTriangle,
  Users,
  History,
  Settings,
  Briefcase,
  FileText,
} from '../icons';
import type { Role } from '@/lib/types';
import { Wordmark } from '../brand/Logo';

type Item = {
  href: string;
  label: string;
  icon: ReactNode;
  allow: Role[];
};

type Group = { label?: string; items: Item[] };

const groups: Group[] = [
  {
    items: [
      { href: '/', label: '總覽', icon: <LayoutDashboard size={20} />, allow: ['ADMIN', 'AUDITOR', 'RESPONDENT', 'SUPERVISOR'] },
    ],
  },
  {
    label: '稽核作業',
    items: [
      { href: '/cycles', label: '稽核週期', icon: <ClipboardCheck size={20} />, allow: ['ADMIN', 'AUDITOR', 'RESPONDENT', 'SUPERVISOR'] },
      { href: '/findings-overview', label: '稽核發現', icon: <AlertTriangle size={20} />, allow: ['ADMIN', 'AUDITOR'] },
    ],
  },
  {
    label: '管理',
    items: [
      { href: '/admin/organizations', label: '醫院管理', icon: <Briefcase size={20} />, allow: ['ADMIN'] },
      { href: '/admin/users', label: '使用者', icon: <Users size={20} />, allow: ['ADMIN'] },
      { href: '/admin/cycles', label: '稽核週期', icon: <ClipboardCheck size={20} />, allow: ['ADMIN'] },
      { href: '/admin/emails', label: 'Email 紀錄', icon: <FileText size={20} />, allow: ['ADMIN'] },
      { href: '/admin/audit-log', label: '審計軌跡', icon: <History size={20} />, allow: ['ADMIN', 'AUDITOR'] },
    ],
  },
];

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

  return (
    <aside
      className={cn(
        'relative flex flex-col bg-surface-container-low transition-all duration-200 ease-standard',
        collapsed ? 'w-20' : 'w-[18rem]',
      )}
    >
      {showBrand && !collapsed && (
        <div className="h-16 flex items-center px-5">
          <Wordmark />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto scrollbar-thin pb-6">
        {groups.map((g, gi) => {
          const items = g.items.filter((i) => i.allow.includes(role));
          if (items.length === 0) return null;
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
                        onClick={onClose}
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
                          {i.icon}
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
          <span className="font-medium">MOECISH</span> · v0.4
        </div>
      )}
    </aside>
  );
}
