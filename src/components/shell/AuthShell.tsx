import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppShell } from './AppShell';
import type { Crumb } from './Breadcrumbs';

export async function AuthShell({
  crumbs,
  loginCallback,
  children,
}: {
  crumbs: Crumb[];
  loginCallback?: string;
  children: ReactNode;
}) {
  const session = await auth();
  if (!session) {
    const u = loginCallback ? `/login?callbackUrl=${encodeURIComponent(loginCallback)}` : '/login';
    redirect(u);
  }
  const user = session.user;
  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        organizationName: user.organizationName,
      }}
      crumbs={crumbs}
    >
      {children}
    </AppShell>
  );
}
