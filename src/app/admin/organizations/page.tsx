import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Chip } from '@/components/ui/Chip';
import { ChevronRight } from '@/components/icons';
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
      {/* ── 文件大標(黑體)+ 動作;公文式底規線 ── */}
      <header className="mb-9 pb-5 border-b border-rule flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-headline-lg text-ink-900 tracking-tight">醫院管理</h1>
          <p className="mt-2.5 text-body-sm text-ink-500 max-w-2xl leading-relaxed">
            管理受稽機關（醫院）、新增機關、查看人員與稽核週期。
          </p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <CreateOrganizationButton />
        </div>
      </header>

      {orgs.length === 0 ? (
        <div className="rounded-md border border-rule bg-card px-6 py-14 text-center">
          <p className="text-title text-ink-700">尚未建立任何醫院</p>
          <p className="mt-1.5 text-body-sm text-ink-500">點右上角「新增醫院」建立第一間。</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-rule bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-rule-strong bg-paper-sunk text-left text-caption text-ink-500">
                  <th className="px-4 py-2.5 font-medium">機關</th>
                  <th className="px-4 py-2.5 font-medium">代碼</th>
                  <th className="px-4 py-2.5 font-medium text-right">人員</th>
                  <th className="px-4 py-2.5 font-medium text-right">邀請</th>
                  <th className="px-4 py-2.5 font-medium">最新稽核週期</th>
                  <th className="px-4 py-2.5 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-b border-rule last:border-b-0 hover:bg-paper-sunk transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink-900">{o.name}</div>
                      {o.shortName && <div className="text-caption text-ink-500">{o.shortName}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-body-sm text-ink-500">{o.code}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-700">{o._count.users}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-700">{o._count.invitations}</td>
                    <td className="px-4 py-3">
                      {o.cycles[0] ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="tabular-nums text-ink-900">{o.cycles[0].year - 1911} 年</span>
                          <Chip size="sm" tone={cycleStatusTone(o.cycles[0].status as CycleStatus)} dot>
                            {CYCLE_STATUS_LABELS[o.cycles[0].status as CycleStatus]}
                          </Chip>
                        </span>
                      ) : (
                        <span className="text-caption text-ink-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/organizations/${o.id}`}
                        className="inline-flex items-center gap-1 font-medium text-primary-700 hover:underline"
                      >
                        查看
                        <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
