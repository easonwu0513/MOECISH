'use client';

import { IconButton } from '../ui/IconButton';
import { Menu, Search, Command as CmdIcon } from '../icons';
import { UserMenu } from './UserMenu';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';
import type { Role } from '@/lib/types';

export function TopStrip({
  user,
  crumbs,
  onMenuClick,
  onCommandOpen,
}: {
  user: { name: string; email: string; role: Role; organizationName: string | null };
  crumbs: Crumb[];
  onMenuClick?: () => void;
  onCommandOpen?: () => void;
}) {
  return (
    <div className="sticky top-0 z-30 h-14 flex items-center gap-3 px-3 md:px-5 border-b border-hairline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
      <div className="md:hidden">
        <IconButton icon={<Menu size={20} />} label="開啟選單" onClick={onMenuClick} />
      </div>

      <div className="flex-1 min-w-0 hidden sm:block">
        <Breadcrumbs items={crumbs} />
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={onCommandOpen}
          className="hidden md:inline-flex items-center gap-2 h-9 pl-3 pr-2 text-body-sm text-neutral-500 bg-white hover:bg-neutral-25 border border-subtle hover:border-strong rounded-lg focus-ring transition-all duration-180"
          aria-label="開啟命令面板"
        >
          <Search size={15} className="text-neutral-400" />
          <span>搜尋或執行命令</span>
          <span className="kbd ml-3">⌘K</span>
        </button>
        <IconButton
          variant="ghost"
          icon={<CmdIcon size={18} />}
          label="命令面板"
          onClick={onCommandOpen}
          className="md:hidden"
        />
        <div className="w-px h-6 bg-hairline mx-1 hidden md:block" aria-hidden />
        <UserMenu
          name={user.name}
          email={user.email}
          role={user.role}
          organizationName={user.organizationName}
        />
      </div>
    </div>
  );
}
