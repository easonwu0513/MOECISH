import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ROLE_LABELS, ROLE_TONE, type Role } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: '個人資料 · MOECISH' };

export default async function AccountPage() {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/account');
  const user = session.user;
  const role = user.role as Role;

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '個人資料' }]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-on-surface">個人資料</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">您的帳號資訊;如需變更密碼請點下方按鈕。</p>
      </header>

      <Card className="max-w-lg" variant="outlined">
        <dl className="divide-y divide-outline-variant/60">
          <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
            <dt className="text-body-sm text-on-surface-variant shrink-0">姓名</dt>
            <dd className="text-body text-on-surface text-right">{user.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-body-sm text-on-surface-variant shrink-0">Email</dt>
            <dd className="text-body-sm font-mono text-on-surface text-right break-all">{user.email}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-body-sm text-on-surface-variant shrink-0">角色</dt>
            <dd className="text-right"><Chip tone={ROLE_TONE[role]} size="sm">{ROLE_LABELS[role]}</Chip></dd>
          </div>
          {user.organizationName && (
            <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
              <dt className="text-body-sm text-on-surface-variant shrink-0">所屬醫院</dt>
              <dd className="text-body text-on-surface text-right">{user.organizationName}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6 pt-5 border-t border-outline-variant/60">
          <Button href="/account/password" variant="tonal" size="sm">變更密碼</Button>
        </div>
      </Card>
    </AppShell>
  );
}
