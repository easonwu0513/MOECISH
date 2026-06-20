import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableScroll } from '@/components/ui/TableScroll';
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

const ENTITY_LABELS: Record<string, string> = {
  AuditCycle: '稽核週期', Deficiency: '缺失', CorrectiveAction: '矯正措施', AuditorAssignment: '委員指派',
  SignedReport: '用印報告', Evidence: '佐證', PrepRequirement: '資料需求', PrepSubmission: '資料上傳',
  ChecklistResponse: '檢核回應', AuditorComment: '委員意見', Invitation: '邀請', User: '使用者',
  Organization: '機關', ChecklistVersion: '檢核表版本', AuditScore: '評分', AuditFinding: '稽核發現',
};
const entityLabel = (t: string) => ENTITY_LABELS[t] ?? t;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { entity?: string; actor?: string; from?: string; to?: string };
}) {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin/audit-log');
  const user = session.user;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'AUDITOR') redirect('/dashboard');

  const entity = searchParams.entity || undefined;
  const actorId = searchParams.actor || undefined;
  const from = searchParams.from || undefined;
  const to = searchParams.to || undefined;
  const createdAt = from || to
    ? { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}) }
    : undefined;

  const where = {
    ...(entity ? { entityType: entity } : {}),
    ...(actorId ? { actorId } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
  const logs = await prisma.auditLog.findMany({
    where,
    include: { actor: { select: { name: true, email: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const entityTypes = await prisma.auditLog.groupBy({
    by: ['entityType'],
    _count: true,
    orderBy: { entityType: 'asc' },
  });

  // 操作者篩選選項(曾留下軌跡者)
  const actorGroups = await prisma.auditLog.groupBy({ by: ['actorId'], where: { NOT: { actorId: null } } });
  const actorList = await prisma.user.findMany({
    where: { id: { in: actorGroups.map((g) => g.actorId).filter((x): x is string => Boolean(x)) } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理', href: '/admin/organizations' }, { label: '稽核軌跡' }]}
    >
      <header className="mb-6 flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-headline text-on-surface">稽核軌跡</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">
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
                {entityLabel(t.entityType)}({t._count})
              </Chip>
            </a>
          ))}
        </div>
      </header>

      {/* 操作者 / 日期區間篩選(面對教育部稽核或院方申訴時快速舉證) */}
      <form method="get" className="mb-5 flex items-end gap-2 flex-wrap">
        {entity && <input type="hidden" name="entity" value={entity} />}
        <label className="flex flex-col gap-1 text-caption text-on-surface-variant">
          操作者
          <select name="actor" defaultValue={actorId ?? ''} className="h-9 rounded-md border border-outline-variant bg-surface px-2 text-body-sm focus-ring">
            <option value="">全部</option>
            {actorList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption text-on-surface-variant">
          起
          <input type="date" name="from" defaultValue={from ?? ''} className="h-9 rounded-md border border-outline-variant bg-surface px-2 text-body-sm focus-ring" />
        </label>
        <label className="flex flex-col gap-1 text-caption text-on-surface-variant">
          迄
          <input type="date" name="to" defaultValue={to ?? ''} className="h-9 rounded-md border border-outline-variant bg-surface px-2 text-body-sm focus-ring" />
        </label>
        <button type="submit" className="h-9 px-4 rounded-md bg-primary-600 text-white text-body-sm focus-ring hover:bg-primary-700">套用</button>
        {(actorId || from || to) && (
          <a href={entity ? `/admin/audit-log?entity=${encodeURIComponent(entity)}` : '/admin/audit-log'} className="h-9 inline-flex items-center px-3 text-body-sm text-on-surface-variant hover:text-on-surface">清除</a>
        )}
      </form>

      {logs.length === 0 ? (
        <Card>
          <EmptyState icon={<History size={28} />} title="尚無紀錄" description="系統操作後將自動留存軌跡。" />
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <TableScroll>
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
                    <span className="text-on-surface">{entityLabel(l.entityType)}</span>
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
          </TableScroll>
        </Card>
      )}
    </AppShell>
  );
}
