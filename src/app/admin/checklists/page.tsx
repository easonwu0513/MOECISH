import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Chip } from '@/components/ui/Chip';
import VersionActions from './VersionActions';

export const dynamic = 'force-dynamic';

/** 檢核表題庫管理:版本總覽(SUPER_ADMIN)。 */
export default async function ChecklistVersionsPage() {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin/checklists');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard');
  const user = session.user;

  const versions = await prisma.checklistVersion.findMany({
    include: { _count: { select: { items: true, cycles: true } } },
    orderBy: [{ year: 'desc' }, { name: 'asc' }],
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理' }, { label: '檢核表題庫' }]}
    >
      <header className="mb-9 pb-5 border-b border-rule flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-headline-lg text-ink-900 tracking-tight">檢核表題庫管理</h1>
          <p className="mt-2.5 text-body-sm text-ink-500 max-w-2xl leading-relaxed">
            管理各年度檢核表版本與題目內容（含法規對照）；年度換版用「複製為新版」再編修，歷史週期不受影響。
          </p>
        </div>
      </header>

      {versions.length === 0 ? (
        <div className="rounded-md border border-rule bg-card px-6 py-14 text-center">
          <p className="text-title text-ink-700">尚無題庫版本</p>
          <p className="mt-1.5 text-body-sm text-ink-500">
            請先以匯入腳本建立基準版本（npm run checklist:import-gov）。
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-rule bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-rule-strong bg-paper-sunk text-left text-caption text-ink-500">
                  <th className="px-4 py-2.5 font-medium">版本名稱</th>
                  <th className="px-4 py-2.5 font-medium text-right">年度</th>
                  <th className="px-4 py-2.5 font-medium text-right">題目數</th>
                  <th className="px-4 py-2.5 font-medium text-right">使用中週期</th>
                  <th className="px-4 py-2.5 font-medium">狀態</th>
                  <th className="px-4 py-2.5 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-b border-rule last:border-b-0 hover:bg-paper-sunk transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/admin/checklists/${v.id}`} className="font-medium text-primary-700 hover:underline">
                        {v.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-900">{v.year - 1911}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-900">{v._count.items}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-900">{v._count.cycles}</td>
                    <td className="px-4 py-3">
                      {v.isActive
                        ? <Chip size="sm" tone="success" dot>啟用中</Chip>
                        : <Chip size="sm" tone="neutral">停用</Chip>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <VersionActions
                        versionId={v.id}
                        name={v.name}
                        year={v.year}
                        isActive={v.isActive}
                        cycleCount={v._count.cycles}
                      />
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
