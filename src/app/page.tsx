import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { Logo, Wordmark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import {
  ShieldCheck,
  FileText,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
} from '@/components/icons';
import { POST_CATEGORY_LABELS, type PostCategory } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CATEGORY_TONE: Record<PostCategory, 'primary' | 'sage' | 'danger' | 'warning'> = {
  ANNOUNCEMENT: 'primary',
  INTEL: 'sage',
  VULN_ALERT: 'danger',
  EVENT: 'warning',
};

export default async function LandingPage() {
  const session = await auth();

  const [posts, orgCount, cycleCount, defStats] = await Promise.all([
    prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      take: 6,
      select: { id: true, slug: true, category: true, title: true, important: true, pinned: true, publishedAt: true },
    }),
    prisma.organization.count(),
    prisma.auditCycle.count(),
    prisma.correctiveAction.groupBy({ by: ['status'], _count: true }),
  ]);

  const totalActions = defStats.reduce((s, x) => s + x._count, 0);
  const passedActions = defStats.find((x) => x.status === 'PASSED')?._count ?? 0;
  const passRate = totalActions > 0 ? Math.round((passedActions / totalActions) * 100) : 0;

  const important = posts.find((p) => p.important);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* ── 頂欄 ── */}
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-sm border-b border-outline-variant/60">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="focus-ring rounded-md">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/news" className="hidden sm:block px-4 py-2 text-body-sm text-on-surface-variant hover:text-on-surface transition-colors focus-ring rounded-full">
              資安資訊
            </Link>
            {session ? (
              <Link href="/dashboard">
                <Button size="sm">進入系統</Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button size="sm">登入</Button>
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* ── 重要公告橫幅 ── */}
      {important && (
        <Link href={`/news/${important.slug}`} className="block bg-danger-50 border-b border-danger-100 hover:bg-danger-100/70 transition-colors">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2.5 text-body-sm text-danger-700">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="font-medium shrink-0">重要</span>
            <span className="truncate">{important.title}</span>
            <ChevronRight size={14} className="shrink-0 ml-auto" />
          </div>
        </Link>
      )}

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 20% 10%, rgba(40,82,160,0.10), transparent 70%),' +
              'radial-gradient(ellipse 55% 45% at 90% 90%, rgba(103,134,105,0.08), transparent 70%)',
          }}
          aria-hidden
        />
        <div className="relative max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-14 sm:pt-24 sm:pb-20">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <Logo size={48} />
              <Chip tone="primary" size="sm">教育部 · 醫療領域</Chip>
            </div>
            <h1 className="text-display-sm sm:text-display text-on-surface text-balance font-semibold">
              資通安全稽核
              <br />
              改善管考平台
            </h1>
            <p className="mt-5 text-body-lg text-on-surface-variant max-w-xl text-pretty leading-relaxed">
              讓每一次稽核都清楚、從容、留得下軌跡。
              從稽核前資料準備、缺失矯正填報到委員審查結案，
              一站式完成醫療機構資通安全稽核管考作業。
            </p>
            <div className="mt-8 flex gap-3 flex-wrap">
              {session ? (
                <Link href="/dashboard">
                  <Button size="lg">進入系統</Button>
                </Link>
              ) : (
                <Link href="/login">
                  <Button size="lg">登入系統</Button>
                </Link>
              )}
              <Link href="/news">
                <Button size="lg" variant="tonal">瀏覽資安資訊</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 數字 ── */}
      <section className="border-y border-outline-variant/60 bg-surface-container-lowest">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 sm:grid-cols-3 gap-8">
          <Stat icon={<ShieldCheck size={22} />} value={`${orgCount}`} label="服務醫療機構" />
          <Stat icon={<ClipboardCheck size={22} />} value={`${cycleCount}`} label="稽核週期" />
          <Stat icon={<CheckCircle size={22} />} value={`${passRate}%`} label="矯正措施通過率" />
        </div>
      </section>

      {/* ── 最新資訊 ── */}
      <section className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-14 w-full">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-headline text-on-surface">最新資安資訊</h2>
          <Link href="/news" className="text-body-sm text-primary-700 hover:underline focus-ring rounded-sm inline-flex items-center gap-0.5">
            查看全部
            <ChevronRight size={14} />
          </Link>
        </div>
        {posts.length === 0 ? (
          <div className="rounded-lg border border-outline-variant p-10 text-center text-body-sm text-on-surface-variant">
            尚無公告。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((p) => (
              <Link key={p.id} href={`/news/${p.slug}`} className="group focus-ring rounded-lg">
                <article className="h-full rounded-lg border border-outline-variant/70 bg-surface-container-lowest p-5 transition-all duration-200 ease-standard group-hover:border-outline group-hover:shadow-elev-1">
                  <div className="flex items-center gap-2 mb-3">
                    <Chip tone={CATEGORY_TONE[p.category as PostCategory] ?? 'primary'} size="sm" dot>
                      {POST_CATEGORY_LABELS[p.category as PostCategory] ?? p.category}
                    </Chip>
                    {p.pinned && <Chip tone="neutral" size="sm">置頂</Chip>}
                  </div>
                  <h3 className="text-title text-on-surface leading-snug line-clamp-2 group-hover:text-primary-700 transition-colors">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-caption text-on-surface-variant tabular-nums">
                    {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                  </p>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── 流程 ── */}
      <section className="bg-surface-container-low border-y border-outline-variant/60">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <h2 className="text-headline text-on-surface mb-8">稽核管考流程</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Step no="01" icon={<FileText size={20} />} title="資料準備" desc="受稽機關於實地稽核前上傳檢核表與佐證文件,委員線上確認齊備。" />
            <Step no="02" icon={<ClipboardCheck size={20} />} title="實地稽核" desc="稽核委員到場查核,平台留存當日資料與紀錄。" />
            <Step no="03" icon={<AlertTriangle size={20} />} title="缺失矯正" desc="缺失發布後,機關填報根因分析、改善措施與佐證,逐項送審。" />
            <Step no="04" icon={<CheckCircle size={20} />} title="審查結案" desc="委員逐項審查通過,機關用印上傳,全數完成後正式結案。" />
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mt-auto">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <Wordmark />
            <p className="mt-2 text-caption text-on-surface-variant">
              MOECISH · 教育部資通安全稽核改善管考系統
            </p>
          </div>
          <div className="text-caption text-on-surface-variant space-y-1 sm:text-right">
            <p>主辦單位:教育部 · 維運:資安推動中心</p>
            <p>聯絡信箱:<a className="font-mono hover:text-primary-700" href="mailto:moecish@m365.ntu.edu.tw">moecish@m365.ntu.edu.tw</a></p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-display-sm font-semibold text-on-surface tabular-nums leading-none">{value}</p>
        <p className="mt-1.5 text-body-sm text-on-surface-variant">{label}</p>
      </div>
    </div>
  );
}

function Step({ no, icon, title, desc }: { no: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-lg bg-surface-container-lowest border border-outline-variant/70 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-display-sm font-semibold text-outline-variant tabular-nums select-none">{no}</span>
      </div>
      <h3 className="text-title text-on-surface">{title}</h3>
      <p className="mt-1.5 text-body-sm text-on-surface-variant leading-relaxed">{desc}</p>
    </div>
  );
}
