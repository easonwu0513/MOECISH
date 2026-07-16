'use client';

import { ReactNode, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTrackRemind } from '@/components/cycle/useTrackRemind';
import { cn } from '@/lib/cn';
import { Sidebar } from './Sidebar';
import { TopStrip } from './TopStrip';
import IdleLogout from './IdleLogout';
import ScreenWatermark from './ScreenWatermark';
import { AiAssistant } from '@/components/ai/AiAssistant';
import type { Crumb } from './Breadcrumbs';
import type { Role } from '@/lib/types';
import { CommandPalette, useCommandHotkey, type Command } from '../ui/CommandPalette';
import { useDialogA11y } from '../ui/useDialogA11y';
import { ConfirmDialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';
import { NavProvider } from './NavProgress';
import { AlertTriangle, Eye, LogOut, Megaphone, Shield } from '../icons';
import { navCommandRoutes, navIcon } from './nav-map';

export function AppShell({
  user,
  crumbs,
  children,
  cycleId,
  watermark,
  wide,
}: {
  user: { name: string; email: string; role: Role; organizationName: string | null };
  crumbs: Crumb[];
  children: ReactNode;
  cycleId?: string;
  /** 在「機關上傳資料」檢視頁開啟登入者浮水印(防外流可溯源);其餘頁面不套用。 */
  watermark?: boolean;
  /** 工具型頁面(如信件範本產生器)需要更寬工作區→取消 max-w-screen-xl 上限,吃滿可用寬度。 */
  wide?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  useCommandHotkey(setCmdOpen);
  const drawerRef = useDialogA11y(mobileOpen, () => setMobileOpen(false));

  // ⌘K 動詞執行:有副作用的動作(如寄信)先經確認對話框,再實際呼叫 API。
  const [confirm, setConfirm] = useState<
    { title: string; description: string; confirmLabel: string; run: () => Promise<void> } | null
  >(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const remind = useTrackRemind(); // 共用 hook(與 admin/cycles RemindButton 單一來源,消手抄漂移)

  const commands: Command[] = useMemo(() => [
    // 導覽 + 管理:由 nav-map SoT 派生(與側欄同一份清單,杜絕兩處漂移)
    ...navCommandRoutes(user.role).map(
      (r) =>
        ({
          id: r.href,
          group: r.cmdGroupResolved,
          label: r.label,
          icon: navIcon(r.iconKey, 16),
          action: () => router.push(r.href),
        }) as Command,
    ),
    // 週期內情境捷徑(依當前 cycleId 動態產生,非全站路由,故留在此)
    ...(cycleId
      ? [
          { id: 'deficiencies', group: '導覽', label: '缺失與矯正', icon: <AlertTriangle size={16} />, action: () => router.push(`/cycles/${cycleId}/deficiencies`) } as Command,
          ...(user.role === 'AUDITOR' || user.role === 'SUPER_ADMIN'
            ? [{ id: 'review', group: '導覽', label: '資通安全檢核表（審閱）', icon: <Eye size={16} />, keywords: '委員審閱 檢核表 review 審閱', action: () => router.push(`/cycles/${cycleId}/review`) } as Command]
            : []),
          { id: 'cycle', group: '導覽', label: '稽核週期首頁', hint: '回到本週期', action: () => router.push(`/cycles/${cycleId}`) } as Command,
        ]
      : []),
    // 動作(可執行的動詞,非僅導覽;有副作用者先經確認對話框)
    ...(cycleId && user.role === 'SUPER_ADMIN'
      ? [
          {
            id: 'act-remind',
            group: '動作',
            label: '寄追蹤信給機關（本週期）',
            icon: <Megaphone size={16} />,
            keywords: '催辦 追蹤 提醒 remind',
            action: () =>
              setConfirm({
                title: '寄送進度追蹤提醒',
                description:
                  '將以 email 通知本週期的機關管理員仍有待辦事項，並記錄於催辦軌跡。同一天重複點擊不會重複寄送。',
                confirmLabel: '寄送提醒',
                run: async () => { if (cycleId) await remind(cycleId); },
              }),
          } as Command,
        ]
      : []),
    {
      id: 'act-copy',
      group: '動作',
      label: '複製本頁連結',
      keywords: '分享 連結 link copy',
      action: async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          toast.success('已複製本頁連結');
        } catch {
          toast.error('複製失敗', '瀏覽器未允許存取剪貼簿');
        }
      },
    } as Command,
    {
      id: 'act-refresh',
      group: '動作',
      label: '重新整理本頁',
      keywords: '刷新 refresh reload',
      action: () => {
        router.refresh();
        toast.info('已重新整理');
      },
    } as Command,
    { id: 'password', group: '帳號', label: '變更密碼', icon: <Shield size={16} />, action: () => router.push('/account/password') },
    { id: 'logout', group: '帳號', label: '登出', icon: <LogOut size={16} />, action: () => signOut({ callbackUrl: '/login' }) },
  ], [user.role, cycleId, router, toast, remind]);

  return (
    <NavProvider>
    <a
      href="#main-content"
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:z-[60] focus-visible:top-3 focus-visible:left-3 focus-visible:rounded-md focus-visible:bg-primary-600 focus-visible:px-4 focus-visible:py-2 focus-visible:text-label-lg focus-visible:font-medium focus-visible:text-white focus-visible:shadow-elev-2"
    >
      跳到主要內容
    </a>
    <div className="min-h-screen flex bg-paper">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar role={user.role} userKey={user.email} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40"
          role="dialog"
          aria-modal="true"
          aria-label="主選單"
        >
          <div className="absolute inset-0 scrim" onClick={() => setMobileOpen(false)} />
          {/* h-full flex:給 Sidebar 定高(外層 fixed inset-0=視窗高),否則 nav 的 overflow-y-auto
              永不生效——週期樹展開後內容溢出視窗會完全按不到(三鏡審查 confirmed) */}
          <div ref={drawerRef} tabIndex={-1} className="relative z-50 h-full flex animate-slide-in-right shadow-elev-5 outline-none">
            <Sidebar role={user.role} userKey={user.email} onClose={() => setMobileOpen(false)} />
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
        <main id="main-content" tabIndex={-1} className={cn('flex-1 min-w-0 outline-none')}>
          <div className={cn('mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10', wide ? 'max-w-none' : 'max-w-screen-xl')}>
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} commands={commands} />
      {/* ⌘K 有副作用動詞的確認框(如寄追蹤信);確認後才實際呼叫 API */}
      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(o) => { if (!o) setConfirm(null); }}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          loading={confirmLoading}
          onConfirm={async () => {
            setConfirmLoading(true);
            try {
              await confirm.run();
            } finally {
              setConfirmLoading(false);
              setConfirm(null);
            }
          }}
        />
      )}
      {/* 浮水印只在機關上傳資料的檢視頁套用(資料準備/檢核表審閱/缺失矯正),非全站 */}
      {watermark && <ScreenWatermark name={user.name} email={user.email} />}
      {/* AI 小幫手:NEXT_PUBLIC_AI_ASSISTANT=1 才掛載;未接 LLM 時後端回 503,旗標關則整個隱藏 */}
      {process.env.NEXT_PUBLIC_AI_ASSISTANT === '1' && <AiAssistant />}
      <IdleLogout />
    </div>
    </NavProvider>
  );
}
