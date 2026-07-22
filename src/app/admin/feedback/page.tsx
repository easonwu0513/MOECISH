import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { MessageSquare } from '@/components/icons';
import { FilterChipLink } from '@/components/ui/FilterChip';
import { ROLE_LABELS, type Role } from '@/lib/types';
import { fmtROCDateTime } from '@/lib/date';
import { FeedbackStatusButton } from './FeedbackStatusButton';

export const dynamic = 'force-dynamic';

/**
 * 問題回饋檢視(UAT 圖50;僅中心,/admin layout 已閘):
 * 右下角浮動小工具收集的回報,依狀態篩選、標記已處理(可復原)。
 */
export default async function AdminFeedbackPage({ searchParams }: { searchParams: { state?: string } }) {
  const session = await auth();
  const user = session!.user;

  const state = searchParams.state === 'resolved' ? 'RESOLVED' : searchParams.state === 'open' ? 'OPEN' : null;
  const all = await prisma.feedbackReport.findMany({
    where: state ? { status: state } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { name: true, email: true } } },
  });
  const [openCount, resolvedCount] = await Promise.all([
    prisma.feedbackReport.count({ where: { status: 'OPEN' } }),
    prisma.feedbackReport.count({ where: { status: 'RESOLVED' } }),
  ]);

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '問題回饋' }]}
    >
      <div className="mb-5">
        <h1 className="text-title-lg text-ink-900">問題回饋</h1>
        <p className="mt-1 text-body-sm text-ink-500">使用者由右下角「問題回饋」送出的操作問題與建議；處理完成後標記已處理。</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChipLink href="/admin/feedback" selected={state === null}>全部（{openCount + resolvedCount}）</FilterChipLink>
        <FilterChipLink href="/admin/feedback?state=open" selected={state === 'OPEN'}>待處理（{openCount}）</FilterChipLink>
        <FilterChipLink href="/admin/feedback?state=resolved" selected={state === 'RESOLVED'}>已處理（{resolvedCount}）</FilterChipLink>
      </div>

      {all.length === 0 ? (
        <Card variant="outlined" padded={false}>
          <div className="p-6">
            <EmptyState icon={<MessageSquare size={28} />} title="目前沒有回饋" description="使用者送出問題回饋後會顯示於此。" />
          </div>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {all.map((f) => (
            <li key={f.id}>
              <Card variant="outlined">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body-sm font-medium text-ink-900">{f.user.name}</span>
                      <Chip size="sm" tone="neutral">{ROLE_LABELS[f.role as Role] ?? f.role}</Chip>
                      <span className="text-caption text-ink-500">{f.user.email}</span>
                      <span className="text-caption text-ink-400">{fmtROCDateTime(f.createdAt)}</span>
                      {f.page && <span className="text-caption text-ink-400 truncate" title={f.page}>頁面：{f.page}</span>}
                    </div>
                    <p className="mt-2 text-body-sm text-ink-900 whitespace-pre-line break-words">{f.content}</p>
                    {f.status === 'RESOLVED' && f.resolvedAt && (
                      <p className="mt-1.5 text-caption text-ink-500">已於 {fmtROCDateTime(f.resolvedAt)} 標記處理</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Chip size="sm" tone={f.status === 'RESOLVED' ? 'success' : 'warning'} dot>
                      {f.status === 'RESOLVED' ? '已處理' : '待處理'}
                    </Chip>
                    <FeedbackStatusButton id={f.id} status={f.status as 'OPEN' | 'RESOLVED'} />
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
