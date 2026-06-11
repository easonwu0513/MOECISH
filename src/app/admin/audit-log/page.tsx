import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { History } from '@/components/icons';

const ACTION_LABELS: Record<string, string> = {
  CYCLE_CREATE: '建立週期',
  CYCLE_TRANSITION: '週期狀態轉換',
  CYCLE_NOTIFY_ORG_ADMINS: '通知機關',
  DEFICIENCY_CREATE: '建立缺失',
  DEFICIENCY_UPDATE: '編輯缺失',
  DEFICIENCY_DELETE: '刪除缺失',
  DEFICIENCY_IMPORT: 'Excel 匯入缺失',
  ACTION_SAVE: '儲存矯正草稿',
  ACTION_SUBMIT: '提交矯正送審',
  ACTION_PASS: '審核通過',
  ACTION_RETURN: '退回補正',
  AUDITOR_ASSIGN: '指派委員',
  AUDITOR_UNASSIGN: '移除委員',
  SIGNED_REPORT_UPLOAD: '上傳用印掃描',
  SIGNED_REPORT_CONFIRM: '確認用印掃描',
  EVIDENCE_UPLOAD: '上傳佐證',
  PREP_REQUIREMENT_CREATE: '新增資料需求',
  PREP_REQUIREMENT_DELETE: '刪除資料需求',
  PREP_STANDARD_APPLY: '套用標準清單',
  PREP_SUBMISSION_UPDATE: '更新資料上傳',
  PREP_CONFIRM: '確認資料齊備',
  PREP_INSUFFICIENT: '標記缺件',
  AUDITOR_COMMENT_CREATE: '委員意見',
  AUDITOR_COMMENT_RESOLVE: '意見補正',
  INVITATION_CREATE: '建立邀請',
  INVITATION_ACCEPT: '接受邀請',
  TRACKING_SEND: '寄送追蹤信',
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { entity?: string };
}) {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin/audit-log');
  const user = session.user;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'AUDITOR') redirect('/dashboard');

  const entity = searchParams.entity || undefined;
  const logs = await prisma.auditLog.findMany({
    where: entity ? { entityType: entity } : {},
    include: { actor: { select: { name: true, email: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const entityTypes = await prisma.auditLog.groupBy({
    by: ['entityType'],
    _count: true,
    orderBy: { entityType: 'asc' },
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理', href: '/admin/organizations' }, { label: '稽核軌跡' }]}
    >
      <header className="mb-6 flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-headline text-on-surface">稽核軌跡</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            所有寫入操作之不可否認紀錄;顯示最近 200 筆。
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <a href="/admin/audit-log">
            <Chip tone={!entity ? 'primary' : 'neutral'} size="sm">全部</Chip>
          </a>
          {entityTypes.map((t) => (
            <a key={t.entityType} href={`/admin/audit-log?entity=${encodeURIComponent(t.entityType)}`}>
              <Chip tone={entity === t.entityType ? 'primary' : 'neutral'} size="sm">
                {t.entityType}({t._count})
              </Chip>
            </a>
          ))}
        </div>
      </header>

      {logs.length === 0 ? (
        <Card>
          <EmptyState icon={<History size={28} />} title="尚無紀錄" description="系統操作後將自動留存軌跡。" />
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <table className="w-full text-body-sm">
            <thead className="text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low">
              <tr>
                <th className="text-left px-5 py-3 font-medium">時間</th>
                <th className="text-left px-5 py-3 font-medium">操作者</th>
                <th className="text-left px-5 py-3 font-medium">動作</th>
                <th className="text-left px-5 py-3 font-medium">對象</th>
                <th className="text-left px-5 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-outline-variant/60 hover:bg-surface-container-low transition-colors align-top">
                  <td className="px-5 py-3 text-on-surface-variant whitespace-nowrap tabular-nums">
                    {l.createdAt.toLocaleString('zh-TW', { hour12: false })}
                  </td>
                  <td className="px-5 py-3">
                    {l.actor ? (
                      <>
                        <span className="text-on-surface">{l.actor.name}</span>
                        <span className="block text-caption font-mono text-on-surface-variant">{l.actor.email}</span>
                      </>
                    ) : (
                      <span className="text-on-surface-variant">系統</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Chip tone="neutral" size="sm">{ACTION_LABELS[l.action] ?? l.action}</Chip>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-on-surface-variant">{l.entityType}</span>
                    <span className="block text-caption font-mono text-on-surface-variant truncate max-w-[180px]">
                      {l.entityId}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-caption font-mono text-on-surface-variant">
                    {l.ipAddress ?? '—'}
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
