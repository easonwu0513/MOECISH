import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClipboardCheck } from '@/components/icons';
import { CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';

export default async function AdminCyclesPage() {
  const session = await auth();
  const user = session!.user;

  const cycles = await prisma.auditCycle.findMany({
    include: {
      organization: true,
      checklistVersion: { select: { year: true } },
      _count: { select: { responses: true, findings: true, signatures: true } },
    },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理', href: '/admin/organizations' }, { label: '稽核週期' }]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-on-surface">稽核週期管理</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          跨機關的所有稽核週期。要建立新週期請到醫院管理選擇對應醫院。
        </p>
      </header>

      {cycles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardCheck size={28} />}
            title="尚無稽核週期"
            description="前往醫院管理建立第一份週期。"
          />
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <table className="w-full text-body-sm">
            <thead className="text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low">
              <tr>
                <th className="text-left px-5 py-3 font-medium">年度</th>
                <th className="text-left px-5 py-3 font-medium">機關</th>
                <th className="text-left px-5 py-3 font-medium">題庫</th>
                <th className="text-left px-5 py-3 font-medium">狀態</th>
                <th className="text-right px-5 py-3 font-medium">填答</th>
                <th className="text-right px-5 py-3 font-medium">發現</th>
                <th className="text-right px-5 py-3 font-medium">簽章</th>
                <th className="text-right px-5 py-3 font-medium">截止</th>
                <th className="text-right px-5 py-3 font-medium">開啟</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id} className="border-t border-outline-variant/60 hover:bg-surface-container-low transition-colors">
                  <td className="px-5 py-3 tabular-nums font-medium">{c.year - 1911}</td>
                  <td className="px-5 py-3">{c.organization.name}</td>
                  <td className="px-5 py-3 text-on-surface-variant">{c.checklistVersion.year - 1911}</td>
                  <td className="px-5 py-3">
                    <Chip size="sm" tone="neutral">{CYCLE_STATUS_LABELS[c.status as CycleStatus]}</Chip>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{c._count.responses}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{c._count.findings}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{c._count.signatures}</td>
                  <td className="px-5 py-3 text-right text-on-surface-variant">
                    {new Date(c.dueDate).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/cycles/${c.id}`} className="text-primary-700 hover:underline">開啟</Link>
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
