import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Briefcase, Plus, ChevronRight } from '@/components/icons';
import CreateOrganizationButton from './CreateOrganizationButton';

export default async function OrganizationsPage() {
  const session = await auth();
  const user = session!.user;

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { users: true, cycles: true, invitations: true } },
      cycles: {
        orderBy: { year: 'desc' },
        take: 1,
        select: { year: true, status: true },
      },
    },
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理', href: '/admin/organizations' }, { label: '醫院管理' }]}
    >
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-headline text-on-surface">醫院管理</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">管理受稽機關（醫院）、新增機關、查看人員與稽核週期。</p>
        </div>
        <CreateOrganizationButton />
      </header>

      {orgs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Briefcase size={28} />}
            title="尚未建立任何醫院"
            description="點右上角「新增醫院」建立第一間。"
          />
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <table className="w-full text-body-sm">
            <thead className="text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low">
              <tr>
                <th className="text-left px-5 py-3 font-medium">機關</th>
                <th className="text-left px-5 py-3 font-medium">代碼</th>
                <th className="text-right px-5 py-3 font-medium">人員</th>
                <th className="text-right px-5 py-3 font-medium">邀請</th>
                <th className="text-left px-5 py-3 font-medium">最新稽核週期</th>
                <th className="text-right px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id} className="border-t border-outline-variant/60 hover:bg-surface-container-low transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-on-surface">{o.name}</div>
                    {o.shortName && <div className="text-caption text-on-surface-variant">{o.shortName}</div>}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-body-sm text-on-surface-variant">{o.code}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{o._count.users}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{o._count.invitations}</td>
                  <td className="px-5 py-3.5">
                    {o.cycles[0] ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="tabular-nums">{o.cycles[0].year - 1911} 年</span>
                        <Chip size="sm" tone="neutral">{o.cycles[0].status}</Chip>
                      </span>
                    ) : (
                      <span className="text-caption text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/admin/organizations/${o.id}`}
                      className="inline-flex items-center gap-1 text-primary-700 hover:text-primary-800 text-body-sm"
                    >
                      查看
                      <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
