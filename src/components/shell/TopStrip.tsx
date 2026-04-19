'use client';

import { IconButton } from '../ui/IconButton';
import { Menu, Search, Command as CmdIcon } from '../icons';
import { UserMenu } from './UserMenu';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';
import type { Role } from '@/lib/types';

/**
 * Material 3 center-aligned App Bar.
 * Surface-colored with elevation tint when scrolled (approximated with a bottom border here).
 */
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
    <div className="sticky top-0 z-30 h-16 flex items-center gap-3 px-3 md:px-6 bg-surface-container-low">
      <div className="md:hidden">
        <IconButton icon={<Menu size={22} />} label="開啟選單" onClick={onMenuClick} />
      </div>

      <div className="flex-1 min-w-0 hidden sm:block">
        <Breadcrumbs items={crumbs} />
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onCommandOpen}
          className="hidden md:inline-flex items-center gap-2.5 h-10 pl-4 pr-2 text-body-sm text-on-surface-variant bg-surface-container hover:bg-surface-container-high rounded-full focus-ring transition-all duration-200 ease-standard"
          aria-label="開啟命令面板"
        >
          <Search size={16} />
          <span>搜尋或執行命令</span>
          <span className="kbd ml-3">⌘K</span>
        </button>
        <IconButton
          variant="standard"
          icon={<CmdIcon size={20} />}
          label="命令面板"
          onClick={onCommandOpen}
          className="md:hidden"
        />
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
