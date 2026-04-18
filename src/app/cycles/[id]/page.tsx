import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { CYCLE_STATUS_LABELS, nextStatuses } from '@/lib/state-machine';
import type { CycleStatus, Role, SignatureRole } from '@/lib/types';
import {
  ClipboardCheck,
  AlertTriangle,
  Eye,
  Download,
  FileText,
  Upload,
} from '@/components/icons';
import SignedDocumentUpload from './SignedDocumentUpload';
import TransitionButton from './TransitionButton';

export default async function CyclePage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}`);
  const user = session.user;

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      checklistVersion: { include: { items: true } },
      responses: true,
      findings: { include: { remediation: true } },
      signatures: true,
    },
  });
  if (!cycle) notFound();
  if (
    (user.role === 'RESPONDENT' || user.role === 'SUPERVISOR') &&
    cycle.organizationId !== user.organizationId
  ) {
    redirect('/');
  }

  const total = cycle.checklistVersion.items.length;
  const filled = cycle.responses.filter((r) => r.compliance).length;
  const findingsCount = cycle.findings.length;
  const needsImprovement = cycle.findings.filter((f) => f.type === 'NEEDS_IMPROVEMENT').length;
  const remApproved = cycle.findings.filter((f) => f.remediation?.status === 'APPROVED').length;
  const transitions = nextStatuses(cycle.status as CycleStatus, user.role as Role);

  const yearROC = cycle.year - 1911;

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        organizationName: user.organizationName,
      }}
      cycleId={cycle.id}
      crumbs={[
        { label: '總覽', href: '/' },
        { label: '稽核週期', href: '/' },
        { label: `${yearROC} 年度 · ${cycle.organization.name}` },
      ]}
    >
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-headline text-neutral-900">
            {yearROC} 年度資通安全稽核
          </h1>
          <p className="mt-1 text-body text-neutral-500 truncate">
            {cycle.organization.name} ·{' '}
            起 {new Date(cycle.startDate).toLocaleDateString('zh-TW')} 至{' '}
            {new Date(cycle.dueDate).toLocaleDateString('zh-TW')}
          </p>
        </div>
        <Chip tone={cycleTone(cycle.status as CycleStatus)} size="md" dot>
          {CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}
        </Chip>
      </header>

      {/* Overview stats */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <div className="flex items-center gap-4">
            <ProgressRing
              value={filled}
              max={total}
              size={80}
              strokeWidth={8}
              label={`${total ? Math.round((filled / total) * 100) : 0}%`}
              sublabel={`${filled}/${total}`}
            />
            <div>
              <CardTitle>填答進度</CardTitle>
              <CardDescription>共 {total} 題</CardDescription>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-warning-50 flex items-center justify-center">
              <AlertTriangle size={28} className="text-warning-600" />
            </div>
            <div>
              <CardTitle>稽核發現</CardTitle>
              <CardDescription>
                共 {findingsCount} 項 · 待改善 {needsImprovement}
              </CardDescription>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <ProgressRing
              value={remApproved}
              max={needsImprovement || 1}
              size={80}
              strokeWidth={8}
              tone="success"
              label={`${needsImprovement ? remApproved : 0}`}
              sublabel={`/ ${needsImprovement}`}
            />
            <div>
              <CardTitle>改善已通過</CardTitle>
              <CardDescription>
                {needsImprovement > 0
                  ? `剩餘 ${needsImprovement - remApproved} 項待審`
                  : '暫無待改善'}
              </CardDescription>
            </div>
          </div>
        </Card>
      </section>

      {/* Module navigation */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <ModuleTile
          icon={<ClipboardCheck size={22} />}
          tone="primary"
          title="模組一　檢核表填報"
          desc="逐項填寫 83 題符合情形、說明與佐證，由主管核可送出，委員給意見、受稽機關補正。"
          href={`/cycles/${cycle.id}/checklist`}
        />
        <ModuleTile
          icon={<AlertTriangle size={22} />}
          tone="sage"
          title="模組二　稽核發現與改善"
          desc="實地稽核後，委員開立稽核發現；受稽機關填改善措施與執行情形；委員審核通過或持續改正。"
          href={`/cycles/${cycle.id}/findings`}
        />
        <ModuleTile
          icon={<Eye size={22} />}
          tone="neutral"
          title="委員審閱"
          desc="檢視機關填報、對各題給意見（僅稽核委員可編輯）。"
          href={`/cycles/${cycle.id}/review`}
          disabled={user.role !== 'AUDITOR' && user.role !== 'ADMIN'}
        />
      </section>

      {/* Signature (only for respondent / supervisor) */}
      {(user.role === 'RESPONDENT' || user.role === 'SUPERVISOR') && (() => {
        const myRole: SignatureRole = user.role === 'SUPERVISOR' ? 'SUPERVISOR' : 'RESPONDENT';
        const existing = cycle.signatures
          .filter((s) => s.signerRole === myRole)
          .sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime())[0];
        return (
          <section className="mb-6">
            <SignedDocumentUpload
              cycleId={cycle.id}
              signerRole={myRole}
              templateUrl={`/api/cycles/${cycle.id}/export/signature-template`}
              existing={
                existing
                  ? { id: existing.id, signerName: existing.signerName, signedAt: existing.signedAt }
                  : undefined
              }
            />
          </section>
        );
      })()}

      {/* Exports */}
      <Card className="mb-6">
        <CardTitle>匯出</CardTitle>
        <CardDescription>產出制式公文格式檔案</CardDescription>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/api/cycles/${cycle.id}/export/checklist`}>
            <Button variant="secondary" leadingIcon={<Download size={16} />}>
              Excel 檢核表
            </Button>
          </a>
          <a href={`/api/cycles/${cycle.id}/export/remediation`}>
            <Button variant="secondary" leadingIcon={<FileText size={16} />}>
              Word 改善報告
            </Button>
          </a>
          <Link href={`/cycles/${cycle.id}/print`} target="_blank" rel="noopener">
            <Button variant="secondary" leadingIcon={<Upload size={16} />}>
              PDF 綜合報告（瀏覽器另存）
            </Button>
          </Link>
        </div>
      </Card>

      {/* Transitions */}
      {transitions.length > 0 && (
        <Card>
          <CardTitle>可執行之狀態轉換</CardTitle>
          <CardDescription>依您目前的角色與週期狀態</CardDescription>
          <div className="mt-4 flex flex-wrap gap-2">
            {transitions.map((t) => (
              <TransitionButton key={t} cycleId={cycle.id} target={t} />
            ))}
          </div>
        </Card>
      )}
    </AppShell>
  );
}

function ModuleTile({
  icon,
  tone,
  title,
  desc,
  href,
  disabled,
}: {
  icon: React.ReactNode;
  tone: 'primary' | 'sage' | 'neutral';
  title: string;
  desc: string;
  href: string;
  disabled?: boolean;
}) {
  const iconBg = {
    primary: 'bg-primary-50 text-primary-700',
    sage: 'bg-sage-50 text-sage-700',
    neutral: 'bg-neutral-100 text-neutral-600',
  }[tone];

  const content = (
    <Card
      interactive={!disabled}
      className={disabled ? 'opacity-50 pointer-events-none' : ''}
    >
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-title text-neutral-900">{title}</div>
          <p className="mt-1.5 text-body-sm text-neutral-600 leading-relaxed">{desc}</p>
        </div>
      </div>
    </Card>
  );

  if (disabled) return content;
  return <Link href={href}>{content}</Link>;
}

function cycleTone(status: CycleStatus): 'neutral' | 'primary' | 'sage' | 'success' | 'warning' {
  switch (status) {
    case 'DRAFT':
      return 'neutral';
    case 'RESPONDENT_SUBMITTED':
    case 'SUPERVISOR_APPROVED':
      return 'primary';
    case 'IN_REVIEW':
    case 'ONSITE_SCHEDULED':
      return 'sage';
    case 'COMMENTS_RETURNED':
    case 'FINDINGS_ISSUED':
    case 'REMEDIATION_IN_PROGRESS':
      return 'warning';
    case 'CLOSED':
      return 'success';
  }
}
