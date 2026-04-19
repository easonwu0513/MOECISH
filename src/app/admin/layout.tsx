import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import type { ReactNode } from 'react';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin/organizations');
  if (session.user.role !== 'ADMIN') redirect('/');
  return <>{children}</>;
}
