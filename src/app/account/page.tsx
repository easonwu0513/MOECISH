import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
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
  // 實習紀錄(批32):曾為觀察員撰寫過練習者(含已晉升委員)提供回顧入口
  const practiceCount = await prisma.practiceFinding.count({ where: { observerId: user.id } });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '個人資料' }]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-ink-900">個人資料</h1>
        <p className="mt-1 text-body-sm text-ink-500">您的帳號資訊;如需變更密碼請點下方按鈕。</p>
      </header>

      <Card className="max-w-lg" variant="outlined">
        <dl className="divide-y divide-rule">
          <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
            <dt className="text-body-sm text-ink-500 shrink-0">姓名</dt>
            <dd className="text-body text-ink-900 text-right">{user.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-body-sm text-ink-500 shrink-0">Email</dt>
            <dd className="text-body-sm font-mono text-ink-900 text-right break-all">{user.email}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-body-sm text-ink-500 shrink-0">角色</dt>
            <dd className="text-right"><Chip tone={ROLE_TONE[role]} size="sm">{ROLE_LABELS[role]}</Chip></dd>
          </div>
          {user.organizationName && (
            <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
              <dt className="text-body-sm text-ink-500 shrink-0">所屬醫院</dt>
              <dd className="text-body text-ink-900 text-right">{user.organizationName}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6 pt-5 border-t border-rule flex flex-wrap gap-2">
          <Button href="/account/password" variant="tonal" size="sm">變更密碼</Button>
          {practiceCount > 0 && (
            <Button href={`/users/${user.id}/practice-history`} variant="text" size="sm">
              實習紀錄({practiceCount} 條練習)
            </Button>
          )}
        </div>
      </Card>
    </AppShell>
  );
}
