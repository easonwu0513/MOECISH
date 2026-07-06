import { AppShell } from '@/components/shell/AppShell';
import { ReviewWindowLockNotice } from '@/components/cycle/ReviewWindowLock';
import { onsiteStageEnded, type Role } from '@/lib/types';

/**
 * 委員審閱窗口鎖定「整頁殼」(減法批 dup#8):checklist 與 review 兩頁原各抄一份
 * 「AppShell+header+ReviewWindowLockNotice」早退樣板 → 收斂於此,文案/結構不再平行漂移。
 * 早退語意不變:不載入、不序列化任何機關資料。
 */
export function ReviewWindowLockedPage({
  user,
  cycle,
  title,
  crumbLabel,
  state,
}: {
  user: { name: string; email: string; role: Role; organizationName?: string | null };
  cycle: {
    id: string;
    year: number;
    status: string;
    reviewWindowStart: Date | null;
    reviewWindowEnd: Date | null;
    organization: { name: string };
  };
  /** 頁面 H1(資通安全檢核表 / 委員審閱) */
  title: string;
  /** 麵包屑末節(檢核表 / 委員審閱) */
  crumbLabel: string;
  state: 'before' | 'after' | 'unset';
}) {
  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName ?? null }}
      cycleId={cycle.id}
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: `${cycle.year - 1911} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
        { label: crumbLabel },
      ]}
    >
      <header className="mb-5">
        <h1 className="text-headline text-ink-900">{title}</h1>
      </header>
      <ReviewWindowLockNotice
        state={state}
        start={cycle.reviewWindowStart}
        end={cycle.reviewWindowEnd}
        stageEnded={onsiteStageEnded(cycle.status)}
        cycleId={cycle.id}
      />
    </AppShell>
  );
}
