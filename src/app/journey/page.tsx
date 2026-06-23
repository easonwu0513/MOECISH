import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { CheckCircle } from '@/components/icons';
import { cn } from '@/lib/cn';
import { JourneyChecklist } from '@/components/journey/JourneyChecklist';
import { loadJourney, toClientStages } from '@/lib/journey';

export const dynamic = 'force-dynamic';

/** 中心年度計畫執行精靈(PROGRAMME scope):跨院、一次性的年度執行 SOP,依年度綁定進度。 */
export default async function JourneyPage({ searchParams }: { searchParams: { year?: string } }) {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/journey');
  const user = session.user;
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const currentROC = new Date().getFullYear() - 1911;
  const parsed = Number(searchParams.year);
  const year = Number.isInteger(parsed) && parsed > 100 && parsed < 200 ? parsed : currentROC;
  const years = [currentROC - 1, currentROC, currentROC + 1];

  const view = await loadJourney({ scope: 'PROGRAMME', programmeYear: year });
  const stages = view ? toClientStages(view, user.role) : [];

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '引導式精靈' }]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-on-surface">中心年度計畫執行精靈</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">
          依年度計畫生命週期逐階段追蹤中心的執行任務（計畫籌備、委員共識會議、機關說明會、稽核前文件、實地稽核、報帳與結案）。
          勾選即存檔(依年度分開記錄);各階段項目可於「精靈範本」維護。
        </p>
      </header>

      <div className="flex items-center gap-2 mb-5">
        <span className="text-caption text-on-surface-variant">年度</span>
        {years.map((y) => (
          <Link
            key={y}
            href={`/journey?year=${y}`}
            aria-current={y === year ? 'page' : undefined}
            className={cn(
              'inline-flex items-center min-h-9 px-3 rounded-full text-label-lg focus-ring transition-colors tabular-nums',
              y === year
                ? 'bg-primary-container text-on-primary-container font-medium'
                : 'text-on-surface-variant hover:bg-surface-container',
            )}
          >
            {y}
          </Link>
        ))}
      </div>

      {!view || stages.length === 0 ? (
        <Card variant="outlined">
          <EmptyState
            icon={<CheckCircle size={28} />}
            title="尚未建立年度精靈範本"
            description="請至「精靈範本」新增階段與項目,或執行 npm run journey:seed 匯入骨架。"
          />
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-end mb-3">
            <span className="text-caption text-on-surface-variant tabular-nums">
              {year} 年度已完成 {view.doneCount}/{view.total}
            </span>
          </div>
          <JourneyChecklist scope="PROGRAMME" binding={{ programmeYear: year }} stages={stages} />
        </>
      )}
    </AppShell>
  );
}
