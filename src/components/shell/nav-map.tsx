import type { ReactNode } from 'react';
import type { Role } from '@/lib/types';
import {
  LayoutDashboard, ClipboardCheck, Users, History, Briefcase,
  FileText, Folder, Mail, Megaphone, BarChart,
} from '../icons';

/**
 * 全站導覽「單一真實來源」(SoT)。
 * 側欄(Sidebar)與命令面板(⌘K)皆由此一份清單派生,杜絕兩處 href/label/allow 各自硬編而漂移。
 * 收斂前的實際分岔(本次一併統一):
 *   ・「使用者」(側欄)vs「使用者管理」(⌘K) → 統一為「使用者管理」
 *   ・「報告彙整工具」(側欄)vs「稽核報告彙整工具」(⌘K) → 統一為「報告彙整工具」
 *   ・稽核軌跡 allow:側欄含 AUDITOR、⌘K 卻只給 SUPER_ADMIN → 統一含 AUDITOR
 *   ・⌘K 先前僅涵蓋部分後台頁;現自動涵蓋全部後台路由(可搜尋跳轉)
 */

export type NavIconKey =
  | 'dashboard' | 'cycles' | 'orgs' | 'users' | 'crossCycles' | 'scores'
  | 'checklists' | 'prepTemplate' | 'posts' | 'emails' | 'mergeTool' | 'auditLog';

const ICONS: Record<NavIconKey, (size: number) => ReactNode> = {
  dashboard: (s) => <LayoutDashboard size={s} />,
  cycles: (s) => <ClipboardCheck size={s} />,
  orgs: (s) => <Briefcase size={s} />,
  users: (s) => <Users size={s} />,
  crossCycles: (s) => <BarChart size={s} />,
  scores: (s) => <BarChart size={s} />,
  checklists: (s) => <FileText size={s} />,
  prepTemplate: (s) => <FileText size={s} />,
  posts: (s) => <Megaphone size={s} />,
  emails: (s) => <Mail size={s} />,
  mergeTool: (s) => <Folder size={s} />,
  auditLog: (s) => <History size={s} />,
};

/** 取得指定鍵的圖示;尺寸由各消費端指定(側欄 20、⌘K 16),避免在資料層綁死尺寸。 */
export function navIcon(key: NavIconKey, size: number): ReactNode {
  return ICONS[key](size);
}

export type NavGroup = '' | '稽核作業' | '管理';

export type NavRoute = {
  href: string;
  label: string;
  allow: Role[];
  iconKey: NavIconKey;
  group: NavGroup;     // 側欄分組('' = 第一組,無標題)
  cmdGroup?: string;   // ⌘K 分組(預設沿用 group)
};

const ALL: Role[] = ['SUPER_ADMIN', 'AUDITOR', 'ORG_ADMIN'];
const ADMIN: Role[] = ['SUPER_ADMIN'];

export const NAV_ROUTES: NavRoute[] = [
  { href: '/dashboard', label: '總覽',     allow: ALL, iconKey: 'dashboard', group: '',     cmdGroup: '導覽' },
  { href: '/cycles',    label: '稽核週期', allow: ALL, iconKey: 'cycles',    group: '稽核作業', cmdGroup: '導覽' },
  { href: '/admin/organizations',     label: '醫院管理',     allow: ADMIN, iconKey: 'orgs',        group: '管理' },
  { href: '/admin/users',             label: '使用者管理',   allow: ADMIN, iconKey: 'users',       group: '管理' },
  { href: '/admin/cycles',            label: '跨院週期總覽', allow: ADMIN, iconKey: 'crossCycles', group: '管理' },
  { href: '/admin/scores',            label: '跨院評分比較', allow: ADMIN, iconKey: 'scores',      group: '管理' },
  { href: '/admin/checklists',        label: '檢核表題庫',   allow: ADMIN, iconKey: 'checklists',  group: '管理' },
  { href: '/admin/prep-template',     label: '資料準備清單', allow: ADMIN, iconKey: 'prepTemplate',group: '管理' },
  { href: '/admin/posts',             label: '公告管理',     allow: ADMIN, iconKey: 'posts',       group: '管理' },
  { href: '/admin/emails',            label: 'Email',        allow: ADMIN, iconKey: 'emails',      group: '管理' },
  { href: '/admin/tools/audit-merge', label: '報告彙整工具', allow: ADMIN, iconKey: 'mergeTool',   group: '管理' },
  { href: '/admin/audit-log',         label: '稽核軌跡',     allow: ['SUPER_ADMIN', 'AUDITOR'], iconKey: 'auditLog', group: '管理' },
];

export type SidebarGroup = { label?: string; items: NavRoute[] };

/** 側欄分組:依角色過濾、依固定組序排列、剔除空組。 */
export function sidebarGroups(role: Role): SidebarGroup[] {
  const order: NavGroup[] = ['', '稽核作業', '管理'];
  return order
    .map((g) => ({
      label: g || undefined,
      items: NAV_ROUTES.filter((r) => r.group === g && r.allow.includes(role)),
    }))
    .filter((grp) => grp.items.length > 0);
}

/** ⌘K 命令面板可導覽的靜態路由(依角色過濾;已解析分組名)。 */
export function navCommandRoutes(role: Role): (NavRoute & { cmdGroupResolved: string })[] {
  return NAV_ROUTES.filter((r) => r.allow.includes(role)).map((r) => ({
    ...r,
    cmdGroupResolved: r.cmdGroup ?? r.group ?? '導覽',
  }));
}
