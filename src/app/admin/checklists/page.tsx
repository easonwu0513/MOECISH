import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClipboardCheck } from '@/components/icons';
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
      crumbs={[{ label: '管理', href: '/admin/organizations' }, { label: '檢核表題庫' }]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-on-surface">檢核表題庫管理</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          管理各年度檢核表版本與題目內容(含法規對照);年度換版用「複製為新版」再編修,歷史週期不受影響。
        </p>
      </header>

      {versions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardCheck size={28} />}
            title="尚無題庫版本"
            description="請先以匯入腳本建立基準版本(npm run checklist:import-gov)。"
          />
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <table className="w-full text-body-sm">
            <thead className="text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low">
              <tr>
                <th className="text-left px-5 py-3 font-medium">版本名稱</th>
                <th className="text-left px-5 py-3 font-medium">年度</th>
                <th className="text-right px-5 py-3 font-medium">題目數</th>
                <th className="text-right px-5 py-3 font-medium">使用中週期</th>
                <th className="text-left px-5 py-3 font-medium">狀態</th>
                <th className="text-right px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-t border-outline-variant/60 hover:bg-surface-container-low transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/admin/checklists/${v.id}`} className="font-medium text-primary-700 hover:underline">
                      {v.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 tabular-nums">{v.year - 1911}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{v._count.items}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{v._count.cycles}</td>
                  <td className="px-5 py-3">
                    {v.isActive
                      ? <Chip size="sm" tone="success" dot>啟用中</Chip>
                      : <Chip size="sm" tone="neutral">停用</Chip>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <VersionActions versionId={v.id} name={v.name} year={v.year} isActive={v.isActive} />
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
