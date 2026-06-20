'use client';

import { createContext, useContext, useEffect, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';

/**
 * 全域導航進度條(Linear/Vercel 標配)。
 * 機制:AppShell 提供 navigate(href)=startTransition(router.push),isPending 經 context 給進度條。
 * 比 usePathname 偵測更準 —— pathname 只在導航 commit 後才變,force-dynamic 深頁的「點了沒反應」空窗才是要點亮的時段。
 */
type NavCtx = { navigate: (href: string) => void; pending: boolean };
const NavContext = createContext<NavCtx | null>(null);

export function useNav(): NavCtx {
  return useContext(NavContext) ?? { navigate: () => {}, pending: false };
}

export function NavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = (href: string) => startTransition(() => router.push(href));
  return (
    <NavContext.Provider value={{ navigate, pending }}>
      <NavProgressBar active={pending} />
      {children}
    </NavContext.Provider>
  );
}

function NavProgressBar({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (active) {
      setVisible(true);
      setFinishing(false);
    } else if (visible) {
      // 收尾:衝到 100% 再淡出後卸載
      setFinishing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setFinishing(false);
      }, 240);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[120] h-[2px] pointer-events-none" aria-hidden>
      <div
        key={finishing ? 'finish' : 'run'}
        className={cn(
          'h-full bg-primary-600 origin-left motion-reduce:hidden',
          finishing
            ? 'scale-x-100 opacity-0 transition-all duration-200 ease-[cubic-bezier(0.3,0,0.8,0.15)]'
            : 'animate-nav-creep',
        )}
      />
    </div>
  );
}
