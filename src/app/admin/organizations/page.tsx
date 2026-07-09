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
      // 「邀請」欄只計待接受邀請(已接受/已撤銷/已過期不算),與使用者管理頁語意一致(批35 稽核)
      _count: { select: { cycles: true, invitations: { where: { usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } } } },
      cycles: {
        orderBy: { year: 'desc' },
        take: 1,
        select: { year: true, status: true },
      },
    },
  });

  // 「人員」欄多重身分歸戶(批46):與詳情頁「已啟用帳號」一致——啟用中帳號,現用身分屬本機關
  // ∪ 持本機關有效授權(UserRole)。_count.users 只數 User.organizationId,切為觀察員/委員後會漏數。
  const activeUsers = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, organizationId: true, roleGrants: { where: { endedAt: null }, select: { organizationId: true } } },
  });
  const memberCountByOrg = new Map<string, number>();
  {
    const setByOrg = new Map<string, Set<string>>();
    for (const u of activeUsers) {
      const oids = new Set<string>();
      if (u.organizationId) oids.add(u.organizationId);
      for (const g of u.roleGrants) if (g.organizationId) oids.add(g.organizationId);
      for (const oid of oids) {
        let s = setByOrg.get(oid);
        if (!s) { s = new Set(); setByOrg.set(oid, s); }
        s.add(u.id);
      }
    }
    for (const [oid, s] of setByOrg) memberCountByOrg.set(oid, s.size);
  }

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
                    <td className="px-4 py-3 text-right tabular-nums text-ink-700">{memberCountByOrg.get(o.id) ?? 0}</td>
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
