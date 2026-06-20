import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableScroll } from '@/components/ui/TableScroll';
import { Table, THead, Th, Tr, Td } from '@/components/ui/DataTable';
import { Briefcase, Plus, ChevronRight } from '@/components/icons';
import { CYCLE_STATUS_LABELS, cycleStatusTone } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';
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
      crumbs={[{ label: '管理' }, { label: '醫院管理' }]}
    >
      <PageHeader
        title="醫院管理"
        subtitle="管理受稽機關（醫院）、新增機關、查看人員與稽核週期。"
        actions={<CreateOrganizationButton />}
      />

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
          <TableScroll>
          <Table>
            <THead>
              <Th>機關</Th>
              <Th>代碼</Th>
              <Th numeric>人員</Th>
              <Th numeric>邀請</Th>
              <Th>最新稽核週期</Th>
              <Th numeric>操作</Th>
            </THead>
            <tbody>
              {orgs.map((o) => (
                <Tr key={o.id}>
                  <Td className="py-3.5">
                    <div className="font-medium text-on-surface">{o.name}</div>
                    {o.shortName && <div className="text-caption text-on-surface-variant">{o.shortName}</div>}
                  </Td>
                  <Td className="py-3.5 font-mono text-body-sm text-on-surface-variant">{o.code}</Td>
                  <Td numeric className="py-3.5">{o._count.users}</Td>
                  <Td numeric className="py-3.5">{o._count.invitations}</Td>
                  <Td className="py-3.5">
                    {o.cycles[0] ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="tabular-nums">{o.cycles[0].year - 1911} 年</span>
                        <Chip size="sm" tone={cycleStatusTone(o.cycles[0].status as CycleStatus)} dot>
                          {CYCLE_STATUS_LABELS[o.cycles[0].status as CycleStatus]}
                        </Chip>
                      </span>
                    ) : (
                      <span className="text-caption text-on-surface-variant">—</span>
                    )}
                  </Td>
                  <Td className="py-3.5 text-right">
                    <Link
                      href={`/admin/organizations/${o.id}`}
                      className="inline-flex items-center gap-1 text-primary-700 hover:text-primary-800 text-body-sm"
                    >
                      查看
                      <ChevronRight size={14} />
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          </TableScroll>
        </Card>
      )}
    </AppShell>
  );
}
