import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { CycleHubBar } from '@/components/cycle/CycleHubBar';
import { canAccess } from '@/lib/access-policy';
import PracticePad, { type PracticeItemDTO } from './PracticePad';

/**
 * 稽核發現撰寫練習(批30 師徒制):
 * - 觀察員:撰寫/編修自己的練習發現(完全無評分;內容硬隔離,絕不進正式報告)
 * - 指導委員:檢視「自己帶的」觀察員練習,逐條回饋
 * - 中心:唯讀監督全部練習
 * - 機關:不可見(redirect)
 * 練習資料存獨立 PracticeFinding 表;本頁與 practice-findings API 為其唯二消費端。
 */
export default async function PracticePage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/practice`);
  const user = session.user;

  if (user.role === 'ORG_ADMIN') redirect(`/cycles/${params.id}`);

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      checklistVersion: { select: { items: { select: { itemNo: true }, orderBy: { orderIndex: 'asc' } } } },
    },
  });
  if (!cycle) notFound();

  const stageOpen = ['ONSITE', 'REPORT_ISSUED', 'REMEDIATION', 'CLOSED'].includes(cycle.status);

  // 觀察員:須被配對 + 階段閘(practice.access:ONSITE 起、結案鎖定=cycle.access 已擋)
  let viewerKind: 'observer' | 'mentor' | 'center';
  let observerIds: string[];
  if (user.role === 'OBSERVER') {
    const paired = await prisma.cycleObserver.findUnique({
      where: { cycleId_observerId: { cycleId: cycle.id, observerId: user.id } },
      select: { id: true },
    });
    if (!paired) redirect('/dashboard');
    if (!canAccess('practice.access', 'OBSERVER', cycle.status)) redirect(`/cycles/${cycle.id}`);
    viewerKind = 'observer';
    observerIds = [user.id];
  } else if (user.role === 'AUDITOR') {
    const mentees = await prisma.cycleObserver.findMany({
      where: { cycleId: cycle.id, mentorId: user.id },
      select: { observerId: true },
    });
    if (mentees.length === 0) redirect(`/cycles/${cycle.id}`);
    if (!stageOpen) redirect(`/cycles/${cycle.id}`);
    viewerKind = 'mentor';
    observerIds = mentees.map((m) => m.observerId);
  } else if (user.role === 'SUPER_ADMIN') {
    if (!stageOpen) redirect(`/cycles/${cycle.id}`);
    const all = await prisma.cycleObserver.findMany({
      where: { cycleId: cycle.id },
      select: { observerId: true },
    });
    viewerKind = 'center';
    observerIds = all.map((m) => m.observerId);
  } else {
    redirect('/dashboard');
  }

  const findings = observerIds.length
    ? await prisma.practiceFinding.findMany({
        where: { cycleId: cycle.id, observerId: { in: observerIds } },
        include: {
          observer: { select: { id: true, name: true } },
          feedbacks: {
            orderBy: { createdAt: 'asc' },
            include: { mentor: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  const items: PracticeItemDTO[] = findings.map((f) => ({
    id: f.id,
    observerId: f.observerId,
    observerName: f.observer.name,
    aspect: f.aspect,
    kind: f.kind,
    content: f.content,
    checklistRef: f.checklistRef,
    createdAtISO: f.createdAt.toISOString(),
    feedbacks: f.feedbacks.map((fb) => ({
      id: fb.id,
      mentorId: fb.mentorId,
      mentorName: fb.mentor.name,
      content: fb.content,
      createdAtISO: fb.createdAt.toISOString(),
    })),
  }));

  const itemRefs = cycle.checklistVersion?.items.map((i) => i.itemNo) ?? [];
  const yearROC = cycle.year - 1911;
  const canEdit = user.role === 'OBSERVER' && canAccess('practice.access', 'OBSERVER', cycle.status);
  const canFeedback = viewerKind === 'mentor' && cycle.status !== 'CLOSED';

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={cycle.id}
      watermark
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: `${yearROC} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
        { label: viewerKind === 'observer' ? '稽核發現撰寫練習' : '指導觀察員' },
      ]}
    >
      <CycleHubBar
        cycleId={cycle.id}
        label={`${yearROC} 年度 · ${cycle.organization.shortName ?? cycle.organization.name}`}
        nextHint={viewerKind === 'observer' ? '練習撰寫後,可於檢核表審閱對照素材' : '回饋後,回工作台查看下一步'}
      />
      <header className="mb-5">
        <h1 className="text-headline text-ink-900">
          {viewerKind === 'observer' ? '稽核發現撰寫練習' : '指導觀察員'}
        </h1>
        <p className="text-body-sm text-ink-500 mt-1 leading-relaxed">
          {viewerKind === 'observer'
            ? '此為撰寫練習:內容僅您本人、您的指導委員與中心可見,不會代入彙整工具、也不會出現在正式稽核報告。'
            : viewerKind === 'mentor'
              ? '檢視您指導的觀察員練習發現,逐條給予回饋;練習內容不進入正式報告。'
              : '中心唯讀監督:全部觀察員的練習發現與指導回饋;練習內容不進入正式報告。'}
        </p>
      </header>

      <PracticePad
        cycleId={cycle.id}
        viewerKind={viewerKind}
        canEdit={canEdit}
        canFeedback={canFeedback}
        userId={user.id}
        itemRefs={itemRefs}
        initialItems={items}
      />
    </AppShell>
  );
}
