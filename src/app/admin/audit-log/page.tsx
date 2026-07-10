import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { FilterBar, FilterField, FilterSelect, FilterInput } from '@/components/ui/FilterField';
import { Chip } from '@/components/ui/Chip';
import { TableScroll } from '@/components/ui/TableScroll';
import { Button } from '@/components/ui/Button';
import { EMPTY } from '@/lib/copy';
import { fmtROCDateTimeSec } from '@/lib/date';

const ACTION_LABELS: Record<string, string> = {
  CYCLE_CREATE: '建立週期',
  CYCLE_TRANSITION: '週期狀態轉換',
  CYCLE_NOTIFY_ORG_ADMINS: '通知機關',
  DEFICIENCY_CREATE: '建立缺失',
  DEFICIENCY_UPDATE: '編輯缺失',
  DEFICIENCY_DELETE: '刪除缺失',
  DEFICIENCY_IMPORT: 'Excel 匯入缺失',
  ACTION_SAVE: '儲存矯正草稿',
  ACTION_SUBMIT: '送出矯正送審',
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
  PREP_TEMPLATE_ITEM_CREATE: '新增標準清單項目',
  PREP_TEMPLATE_ITEM_UPDATE: '編輯標準清單項目',
  PREP_TEMPLATE_ITEM_DELETE: '刪除標準清單項目',
  PREP_SUBMISSION_UPDATE: '更新資料/理由',
  PREP_SUBMIT: '機關確定繳交資料',
  PREP_CONFIRM: '確認資料齊備',
  PREP_RETURN: '退回補正',
  PREP_INSUFFICIENT: '退回補正(舊)',
  AUDITOR_COMMENT_CREATE: '委員意見',
  AUDITOR_COMMENT_RESOLVE: '意見補正',
  CHECKLIST_REVIEW_DONE: '委員完成檢核表意見',
  CHECKLIST_ORG_REVISION: '機關補正回應',
  INVITATION_CREATE: '建立邀請',
  INVITATION_ACCEPT: '接受邀請',
  TRACKING_SEND: '寄送追蹤信',
  ORG_CREATE: '建立機關',
  ORG_UPDATE: '編輯機關資料',
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
  // 稽核軌跡=中心專用鑑識台(全掃 P2:委員本有週期頁「最近活動」看自己軌跡,不需全域台;
  // admin/layout 已擋非 SUPER_ADMIN,此為對齊而非唯一防線)。
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');

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
  // 取 201 筆:多取 1 筆作「已截斷」訊號(批36:量大時使用者可能誤以為某操作「沒有紀錄」)
  const logsRaw = await prisma.auditLog.findMany({
    where,
    include: { actor: { select: { name: true, email: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 201,
  });
  const truncated = logsRaw.length > 200;
  const logs = truncated ? logsRaw.slice(0, 200) : logsRaw;

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
      crumbs={[{ label: '管理' }, { label: '稽核軌跡' }]}
    >
      <header className="mb-9 pb-5 border-b border-rule flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-headline-lg text-ink-900 tracking-tight">稽核軌跡</h1>
          <p className="mt-2.5 text-body-sm text-ink-500 max-w-2xl leading-relaxed">
            所有寫入操作之不可否認紀錄;{truncated ? '結果超過 200 筆,僅顯示最近 200 筆——請以日期區間或操作者縮小範圍後再查。' : '顯示最近 200 筆。'}
          </p>
        </div>
      </header>

      {/* 篩選單列化(UAT:上方區塊太亂):原「16 種物件類型 chips 牆 + 另一排表單」兩層
          → 物件類型收成下拉,與操作者/日期併為單一篩選列,掃視負擔大減 */}
      <FilterBar>
        <form method="get" className="flex items-end gap-2 flex-wrap">
          <FilterField label="物件類型">
            <FilterSelect name="entity" defaultValue={entity ?? ''}>
              <option value="">全部類型</option>
              {entityTypes.map((t) => (
                <option key={t.entityType} value={t.entityType}>
                  {entityLabel(t.entityType)}({t._count})
                </option>
              ))}
            </FilterSelect>
          </FilterField>
          {/* 操作者 / 日期區間(面對教育部稽核或院方申訴時快速舉證) */}
          <FilterField label="操作者">
            <FilterSelect name="actor" defaultValue={actorId ?? ''}>
              <option value="">全部</option>
              {actorList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </FilterSelect>
          </FilterField>
          <FilterField label="起">
            <FilterInput type="date" name="from" defaultValue={from ?? ''} />
          </FilterField>
          <FilterField label="迄">
            <FilterInput type="date" name="to" defaultValue={to ?? ''} />
          </FilterField>
          <Button type="submit" size="sm">套用</Button>
          {(entity || actorId || from || to) && (
            <Button href="/admin/audit-log" variant="ghost" size="sm">清除</Button>
          )}
        </form>
      </FilterBar>

      {logs.length === 0 ? (
        <div className="rounded-md border border-rule bg-card px-6 py-14 text-center">
          {entity || actorId || from || to ? (
            <>
              <p className="text-title text-ink-700">{EMPTY.noResults.title}</p>
              <p className="mt-1.5 text-body-sm text-ink-500">此條件區間查無操作紀錄;請調整或清除篩選後再試。</p>
              <div className="mt-4"><Button href="/admin/audit-log" variant="tonal" size="sm">清除篩選</Button></div>
            </>
          ) : (
            <>
              <p className="text-title text-ink-700">尚無紀錄</p>
              <p className="mt-1.5 text-body-sm text-ink-500">系統操作後將自動留存軌跡。</p>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-rule bg-card">
          <TableScroll maxHeight="70vh">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-rule-strong bg-paper-sunk text-left text-caption text-ink-500 [&_th]:sticky [&_th]:top-0 [&_th]:bg-paper-sunk">
                  <th className="px-4 py-2.5 font-medium">時間</th>
                  <th className="px-4 py-2.5 font-medium">操作者</th>
                  <th className="px-4 py-2.5 font-medium">動作</th>
                  <th className="px-4 py-2.5 font-medium">對象</th>
                  <th className="px-4 py-2.5 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-rule last:border-b-0 align-top hover:bg-paper-sunk transition-colors">
                    <td className="px-4 py-3 text-ink-500 whitespace-nowrap tabular-nums">
                      {fmtROCDateTimeSec(l.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {l.actor ? (
                        <>
                          <span className="text-ink-900">{l.actor.name}</span>
                          <span className="block text-caption font-mono text-ink-500">{l.actor.email}</span>
                        </>
                      ) : (
                        <span className="text-ink-500">系統</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone="neutral" size="sm">{ACTION_LABELS[l.action] ?? l.action}</Chip>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-ink-900">{entityLabel(l.entityType)}</span>
                      <span className="block truncate text-caption font-mono text-ink-500 max-w-[180px]">
                        {l.entityId}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-caption font-mono text-ink-500">
                      {l.ipAddress ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}
    </AppShell>
  );
}
