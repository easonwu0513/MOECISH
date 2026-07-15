import type { ReactNode } from 'react';
import type { Role } from '@/lib/types';
import {
  LayoutDashboard, ClipboardCheck, Users, History, Briefcase,
  FileText, Folder, Mail, Megaphone, BarChart, CheckCircle, Settings, Send, AlertTriangle,
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
  | 'dashboard' | 'cycles' | 'tracking' | 'journey' | 'orgs' | 'users' | 'crossCycles' | 'scores'
  | 'checklists' | 'prepTemplate' | 'snippets' | 'journeyEdit' | 'posts' | 'emails' | 'letters' | 'mergeTool' | 'auditLog';

const ICONS: Record<NavIconKey, (size: number) => ReactNode> = {
  dashboard: (s) => <LayoutDashboard size={s} />,
  cycles: (s) => <ClipboardCheck size={s} />,
  tracking: (s) => <AlertTriangle size={s} />,
  journey: (s) => <CheckCircle size={s} />,
  orgs: (s) => <Briefcase size={s} />,
  users: (s) => <Users size={s} />,
  crossCycles: (s) => <BarChart size={s} />,
  scores: (s) => <BarChart size={s} />,
  checklists: (s) => <FileText size={s} />,
  prepTemplate: (s) => <FileText size={s} />,
  snippets: (s) => <ClipboardCheck size={s} />,
  journeyEdit: (s) => <Settings size={s} />,
  posts: (s) => <Megaphone size={s} />,
  emails: (s) => <Mail size={s} />,
  letters: (s) => <Send size={s} />,
  mergeTool: (s) => <Folder size={s} />,
  auditLog: (s) => <History size={s} />,
};

/** 取得指定鍵的圖示;尺寸由各消費端指定(側欄 20、⌘K 16),避免在資料層綁死尺寸。 */
export function navIcon(key: NavIconKey, size: number): ReactNode {
  return ICONS[key](size);
}

/**
 * 側欄分組:原「管理」一長串 14 項難掃視 → 依工作性質歸納為五類(UAT:管理左欄太多請歸納分類)。
 * ⌘K 分組刻意維持單一「管理」(cmdGroup),搜尋心智不變。
 */
export type NavGroup = '' | '稽核作業' | '機構與人員' | '統計與紀錄' | '題庫與範本' | '公告與信件' | '工具';

export type NavRoute = {
  href: string;
  label: string;
  allow: Role[];
  iconKey: NavIconKey;
  group: NavGroup;     // 側欄分組('' = 第一組,無標題)
  cmdGroup?: string;   // ⌘K 分組(預設沿用 group)
  /** false = 不列側欄、仍可 ⌘K 搜尋(如「系統寄件紀錄」併入信件管理頁籤後,側欄只留一格) */
  sidebar?: boolean;
};

// ALL 含觀察員(批30):觀察員可用「總覽/稽核週期」基本導覽;其餘後台路由維持 ADMIN,
// 觀察員的工作區入口(檢核表審閱/撰寫練習)由側欄週期樹(CycleNavTree)與週期頁模組卡派生。
const ALL: Role[] = ['SUPER_ADMIN', 'AUDITOR', 'ORG_ADMIN', 'OBSERVER'];
const ADMIN: Role[] = ['SUPER_ADMIN'];
// 缺失持續列管:中心/機關/委員可見,觀察員不可(對齊 access-policy tracking.view)
const TRACK_ROLES: Role[] = ['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR'];

export const NAV_ROUTES: NavRoute[] = [
  { href: '/dashboard', label: '總覽',     allow: ALL, iconKey: 'dashboard', group: '',     cmdGroup: '導覽' },
  { href: '/cycles',    label: '稽核週期', allow: ALL, iconKey: 'cycles',    group: '稽核作業', cmdGroup: '導覽' },
  // 缺失持續列管(批71):中心/機關/委員可見(觀察員不可,對齊 access-policy tracking.view)
  { href: '/tracking',  label: '缺失持續列管', allow: TRACK_ROLES, iconKey: 'tracking', group: '稽核作業', cmdGroup: '導覽' },
  { href: '/journey',   label: '引導式精靈', allow: ADMIN, iconKey: 'journey', group: '稽核作業', cmdGroup: '導覽' },
  // ── 機構與人員 ──
  { href: '/admin/organizations',     label: '醫院管理',     allow: ADMIN, iconKey: 'orgs',        group: '機構與人員', cmdGroup: '管理' },
  { href: '/admin/users',             label: '使用者管理',   allow: ADMIN, iconKey: 'users',       group: '機構與人員', cmdGroup: '管理' },
  // ── 統計與紀錄 ──
  { href: '/admin/cycles',            label: '跨院週期總覽', allow: ADMIN, iconKey: 'crossCycles', group: '統計與紀錄', cmdGroup: '管理' },
  { href: '/admin/scores',            label: '跨院評分比較', allow: ADMIN, iconKey: 'scores',      group: '統計與紀錄', cmdGroup: '管理' },
  { href: '/admin/audit-log',         label: '稽核軌跡',     allow: ADMIN, iconKey: 'auditLog', group: '統計與紀錄', cmdGroup: '管理' },
  // ── 題庫與範本 ──
  { href: '/admin/checklists',        label: '檢核表題庫',   allow: ADMIN, iconKey: 'checklists',  group: '題庫與範本', cmdGroup: '管理' },
  { href: '/admin/prep-template',     label: '資料準備清單', allow: ADMIN, iconKey: 'prepTemplate',group: '題庫與範本', cmdGroup: '管理' },
  { href: '/admin/finding-snippets',  label: '發現片語庫',   allow: ADMIN, iconKey: 'snippets',    group: '題庫與範本', cmdGroup: '管理' },
  { href: '/admin/journey',           label: '精靈範本',     allow: ADMIN, iconKey: 'journeyEdit', group: '題庫與範本', cmdGroup: '管理' },
  // ── 公告與信件(Email 寄件紀錄與信件範本併為「信件管理」單一入口,頁內頁籤切換) ──
  { href: '/admin/posts',             label: '公告管理',     allow: ADMIN, iconKey: 'posts',       group: '公告與信件', cmdGroup: '管理' },
  { href: '/admin/letter-templates',  label: '信件管理',     allow: ADMIN, iconKey: 'letters',     group: '公告與信件', cmdGroup: '管理' },
  { href: '/admin/emails',            label: '系統寄件紀錄', allow: ADMIN, iconKey: 'emails',      group: '公告與信件', cmdGroup: '管理', sidebar: false },
  // ── 工具 ──
  { href: '/admin/tools/audit-merge', label: '報告彙整工具', allow: ADMIN, iconKey: 'mergeTool',   group: '工具', cmdGroup: '管理' },
  // 「設計系統」展示頁(開發用活文件)自導覽移除(UAT:承辦不需看);頁面保留可直接以網址開啟。
];

export type SidebarGroup = { label?: string; items: NavRoute[] };

/** 側欄分組:依角色過濾、依固定組序排列、剔除空組(sidebar:false 者不列)。 */
export function sidebarGroups(role: Role): SidebarGroup[] {
  const order: NavGroup[] = ['', '稽核作業', '機構與人員', '統計與紀錄', '題庫與範本', '公告與信件', '工具'];
  return order
    .map((g) => ({
      label: g || undefined,
      items: NAV_ROUTES.filter((r) => r.group === g && r.allow.includes(role) && r.sidebar !== false),
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
