import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClipboardCheck } from '@/components/icons';
import { fmtROCDateTime } from '@/lib/date';
import {
  DEFICIENCY_ASPECT_LABELS,
  ROLE_LABELS,
  type DeficiencyAspect,
  type Role,
} from '@/lib/types';
import { FINDING_KIND_LABELS, type FindingKind } from '@/lib/audit-score';

/**
 * 實習紀錄(批32):觀察員(含已晉升為委員者)的歷史練習發現與指導回饋,依週期分組唯讀呈現。
 * 授權:本人 或 SUPER_ADMIN(晉升後紀錄留存=同 userId 天然銜接;供晉升評估與自我回顧)。
 */
export default async function PracticeHistoryPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/users/${params.id}/practice-history`);
  const viewer = session.user;
  if (viewer.role !== 'SUPER_ADMIN' && viewer.id !== params.id) redirect('/dashboard');

  const person = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, role: true },
  });
  if (!person) notFound();

  const findings = await prisma.practiceFinding.findMany({
    where: { observerId: person.id },
    include: {
      cycle: { select: { id: true, year: true, organization: { select: { name: true, shortName: true } } } },
      feedbacks: {
        orderBy: { createdAt: 'asc' },
        include: { mentor: { select: { name: true } } },
      },
    },
    orderBy: [{ createdAt: 'asc' }],
  });

  // 依週期分組(新年度在前)
  const byCycle = new Map<string, typeof findings>();
  for (const f of findings) {
    const arr = byCycle.get(f.cycleId) ?? [];
    arr.push(f);
    byCycle.set(f.cycleId, arr);
  }
  const groups = [...byCycle.values()].sort((a, b) => b[0].cycle.year - a[0].cycle.year);

  const isSelf = viewer.id === person.id;

  return (
    <AppShell
      user={{ name: viewer.name, email: viewer.email, role: viewer.role, organizationName: viewer.organizationName }}
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        ...(viewer.role === 'SUPER_ADMIN' && !isSelf ? [{ label: '使用者管理', href: '/admin/users' }] : []),
        { label: '實習紀錄' },
      ]}
    >
      <header className="mb-5">
        <h1 className="text-headline text-ink-900">實習紀錄{isSelf ? '' : ` — ${person.name}`}</h1>
        <p className="text-body-sm text-ink-500 mt-1 leading-relaxed">
          觀察員時期的練習發現與指導委員回饋（唯讀留存）；目前身分：{ROLE_LABELS[person.role as Role] ?? person.role}。
          練習內容從未、也不會進入任何正式稽核報告。
        </p>
      </header>

      {groups.length === 0 ? (
        <Card variant="outlined" padded={false}>
          <div className="p-6">
            <EmptyState
              icon={<ClipboardCheck size={28} />}
              title="尚無實習紀錄"
              description="於稽核週期被配對為觀察員並撰寫練習後，紀錄會留存於此。"
            />
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((items) => {
            const c = items[0].cycle;
            return (
              <Card key={c.id}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <CardTitle>
                    {c.year - 1911} 年度 · {c.organization.shortName ?? c.organization.name}
                  </CardTitle>
                  <Chip size="sm" tone="neutral">{items.length} 條練習</Chip>
                  {viewer.role === 'SUPER_ADMIN' && (
                    <Link href={`/cycles/${c.id}`} className="ml-auto text-caption text-primary-700 hover:underline focus-ring rounded-sm">
                      前往週期 →
                    </Link>
                  )}
                </div>
                <div className="flex flex-col divide-y divide-rule">
                  {items.map((f) => (
                    <div key={f.id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip size="sm" tone="primary">{FINDING_KIND_LABELS[f.kind as FindingKind] ?? f.kind}</Chip>
                        <Chip size="sm" tone="neutral">{DEFICIENCY_ASPECT_LABELS[f.aspect as DeficiencyAspect] ?? f.aspect}</Chip>
                        {f.checklistRef && <Chip size="sm" tone="neutral" className="font-mono">{f.checklistRef}</Chip>}
                        <span className="text-caption text-ink-500">{fmtROCDateTime(f.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-body-sm text-ink-900 leading-relaxed">{f.content}</p>
                      {f.feedbacks.length > 0 && (
                        <div className="mt-2.5 rounded-md bg-paper-sunk px-3.5 py-3 flex flex-col gap-2">
                          <p className="text-caption font-medium text-ink-700">指導委員回饋</p>
                          {f.feedbacks.map((fb) => (
                            <div key={fb.id} className="border-l-2 border-primary-300 pl-3">
                              <p className="text-caption text-ink-500">{fb.mentor.name} · {fmtROCDateTime(fb.createdAt)}</p>
                              <p className="mt-0.5 whitespace-pre-wrap text-body-sm text-ink-900 leading-relaxed">{fb.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
