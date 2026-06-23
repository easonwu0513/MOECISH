import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/shell/AppShell';
import JourneyEditor from './JourneyEditor';
import type { Role } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminJourneyPage() {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin/journey');
  const user = session.user;
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const templates = await prisma.journeyTemplate.findMany({
    include: {
      stages: {
        orderBy: { orderIndex: 'asc' },
        include: { items: { orderBy: { orderIndex: 'asc' } } },
      },
    },
  });

  const byScope = (scope: 'CYCLE' | 'PROGRAMME') => {
    const t = templates.find((x) => x.scope === scope);
    return (t?.stages ?? []).map((s) => ({
      id: s.id,
      stageKey: s.stageKey,
      title: s.title,
      summary: s.summary,
      items: s.items.map((it) => ({
        id: it.id,
        title: it.title,
        hint: it.hint,
        role: (it.role as Role | null) ?? null,
      })),
    }));
  };

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '精靈範本' }]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-on-surface">引導式精靈範本</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">
          維護兩種精靈的階段與項目:「中心年度計畫執行」(跨院年度 SOP) 與「週期各階段」(每家醫院、分角色)。
          此處修改即時套用到精靈;已勾選的進度不受影響。
        </p>
      </header>
      <JourneyEditor data={{ CYCLE: byScope('CYCLE'), PROGRAMME: byScope('PROGRAMME') }} />
    </AppShell>
  );
}
