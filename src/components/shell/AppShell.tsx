'use client';

import { ReactNode, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/cn';
import { Sidebar } from './Sidebar';
import { TopStrip } from './TopStrip';
import type { Crumb } from './Breadcrumbs';
import type { Role } from '@/lib/types';
import { CommandPalette, useCommandHotkey, type Command } from '../ui/CommandPalette';
import {
  LayoutDashboard, ClipboardCheck, AlertTriangle, Eye, LogOut, Users, History,
} from '../icons';

export function AppShell({
  user,
  crumbs,
  children,
  cycleId,
}: {
  user: { name: string; email: string; role: Role; organizationName: string | null };
  crumbs: Crumb[];
  children: ReactNode;
  cycleId?: string;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  useCommandHotkey(setCmdOpen);

  const commands: Command[] = [
    { id: 'home', group: '導覽', label: '總覽', icon: <LayoutDashboard size={16} />, action: () => router.push('/') },
    ...(cycleId
      ? [
          { id: 'checklist', group: '導覽', label: '模組一 · 檢核表', icon: <ClipboardCheck size={16} />, action: () => router.push(`/cycles/${cycleId}/checklist`) } as Command,
          { id: 'findings', group: '導覽', label: '模組二 · 稽核發現', icon: <AlertTriangle size={16} />, action: () => router.push(`/cycles/${cycleId}/findings`) } as Command,
          ...(user.role === 'AUDITOR' || user.role === 'ADMIN'
            ? [{ id: 'review', group: '導覽', label: '委員審閱', icon: <Eye size={16} />, action: () => router.push(`/cycles/${cycleId}/review`) } as Command]
            : []),
          { id: 'cycle', group: '導覽', label: '稽核週期首頁', hint: '回到本週期', action: () => router.push(`/cycles/${cycleId}`) } as Command,
        ]
      : []),
    ...(user.role === 'ADMIN'
      ? [
          { id: 'users', group: '管理', label: '使用者管理', icon: <Users size={16} />, action: () => router.push('/admin/users') } as Command,
          { id: 'audit-log', group: '管理', label: '審計軌跡', icon: <History size={16} />, action: () => router.push('/admin/audit-log') } as Command,
        ]
      : []),
    { id: 'logout', group: '帳號', label: '登出', icon: <LogOut size={16} />, action: () => signOut({ callbackUrl: '/login' }) },
  ];

  return (
    <div className="min-h-screen flex bg-app">
      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar role={user.role} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-neutral-900/40" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 animate-slide-in-right">
            <Sidebar role={user.role} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <TopStrip
          user={user}
          crumbs={crumbs}
          onMenuClick={() => setMobileOpen(true)}
          onCommandOpen={() => setCmdOpen(true)}
        />
        <main className={cn('flex-1 min-w-0')}>
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} commands={commands} />
    </div>
  );
}
