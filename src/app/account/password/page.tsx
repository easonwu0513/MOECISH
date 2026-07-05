import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { BASELINE } from '@/lib/security-baseline';
import PasswordForm from './PasswordForm';

/** 變更密碼(所有角色)。 */
export default async function PasswordPage() {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/account/password');
  const user = session.user;

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '變更密碼' }]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-ink-900">變更密碼</h1>
        <p className="mt-1 text-body-sm text-ink-500">
          {BASELINE.enabled
            ? `密碼至少 ${BASELINE.pwMinLength} 字元,含大寫、小寫、數字、特殊符號其中三類;不可與最近三次使用過的密碼相同;效期 ${BASELINE.pwMaxAgeDays} 天。`
            : '建議使用 12 字元以上、混合大小寫字母與數字的密碼。'}
        </p>
      </header>
      <PasswordForm />
    </AppShell>
  );
}
