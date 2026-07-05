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
      startDate: s.startDate ? s.startDate.toISOString() : null,
      dueDate: s.dueDate ? s.dueDate.toISOString() : null,
      items: s.items.map((it) => ({
        id: it.id,
        title: it.title,
        hint: it.hint,
        role: (it.role as Role | null) ?? null,
        autoKey: it.autoKey,
        informational: it.informational,
        href: it.href,
      })),
    }));
  };

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '精靈範本' }]}
    >
      <header className="mb-9 pb-5 border-b border-rule flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-headline-lg text-ink-900 tracking-tight">引導式精靈範本</h1>
          <p className="mt-2.5 text-body-sm text-ink-500 max-w-2xl leading-relaxed">
            維護兩種精靈的階段與項目:「中心年度計畫執行」(跨院年度 SOP) 與「週期各階段」(每家醫院、分角色)。此處修改即時套用到精靈;已勾選的進度不受影響。
          </p>
        </div>
      </header>
      <JourneyEditor data={{ CYCLE: byScope('CYCLE'), PROGRAMME: byScope('PROGRAMME') }} />
    </AppShell>
  );
}
