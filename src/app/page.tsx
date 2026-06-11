import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalFooter } from '@/components/portal/PortalFooter';
import {
  ShieldCheck,
  ChevronRight,
  Check,
  History,
  Paperclip,
  FileText,
} from '@/components/icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { POST_CATEGORY_LABELS, type PostCategory } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CATEGORY_TONE: Record<PostCategory, 'primary' | 'sage' | 'danger' | 'warning'> = {
  ANNOUNCEMENT: 'primary',
  INTEL: 'sage',
  VULN_ALERT: 'danger',
  EVENT: 'warning',
};
const CATEGORY_BAR: Record<PostCategory, string> = {
  ANNOUNCEMENT: 'bg-primary-500',
  INTEL: 'bg-sage-500',
  VULN_ALERT: 'bg-danger-500',
  EVENT: 'bg-warning-500',
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
  const enterHref = session ? '/dashboard' : '/login';
  const enterLabel = session ? '進入系統' : '登入系統';

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* ════ 頂欄(前台三頁共用) ════ */}
      <PortalHeader authed={!!session} />

      {/* ════ 重要公告橫幅 ════ */}
      {important && (
        <Link href={`/news/${important.slug}`} className="block bg-danger-50 border-b border-danger-100 hover:bg-danger-100/70 transition-colors">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2.5 text-body-sm text-danger-700">
            <span className="relative flex w-2 h-2 shrink-0" aria-hidden>
              <span className="animate-soft-pulse absolute inline-flex h-full w-full rounded-full bg-danger-500" />
            </span>
            <span className="font-semibold shrink-0">重要</span>
            <span className="truncate">{important.title}</span>
            <ChevronRight size={14} className="shrink-0 ml-auto" />
          </div>
        </Link>
      )}

      {/* ════ Hero ════ */}
      <section className="relative overflow-hidden">
        <style>{`
          @keyframes medfadeB { 0%, 30% { opacity: 0 } 36%, 63% { opacity: 1 } 69%, 100% { opacity: 0 } }
          @keyframes medfadeC { 0%, 63% { opacity: 0 } 69%, 96% { opacity: 1 } 100% { opacity: 0 } }
          .medfade-b { animation: medfadeB 18s ease-in-out infinite }
          .medfade-c { animation: medfadeC 18s ease-in-out infinite }
        `}</style>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 75% 65% at 10% 0%, rgba(40,82,160,0.07), transparent 65%)',
          }}
          aria-hidden
        />
        <div className="relative max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-16 sm:pt-20 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] items-center gap-12 lg:gap-16">
            {/* 文案 */}
            <div className="max-w-2xl animate-slide-up">
              <p className="text-label text-primary-700 tracking-[0.12em] mb-4">
                教育部轄下醫療領域資訊安全推動中心
              </p>
              <h1 className="text-display-sm sm:text-display text-on-surface text-balance font-semibold leading-[1.12]">
                資通安全稽核
                <br />
                管考平台
              </h1>
              <p className="mt-6 text-body-lg text-on-surface-variant max-w-xl text-pretty leading-relaxed">
                讓每一次稽核都清楚、從容、留得下軌跡。
                從稽核前資料準備、缺失矯正填報到委員審查結案，
                一站式完成醫療機構資通安全稽核管考作業。
              </p>
              <div className="mt-9 flex gap-3 flex-wrap">
                <Link href={enterHref}>
                  <Button size="lg">{enterLabel}</Button>
                </Link>
                <Link href="/news">
                  <Button size="lg" variant="tonal">瀏覽資安資訊</Button>
                </Link>
              </div>
              {/* 信任徽記 */}
              <ul className="mt-10 flex items-center gap-x-6 gap-y-3 flex-wrap text-body-sm text-on-surface-variant">
                {['對齊教育部稽核範本', '全程稽核軌跡留存', '角色權限分級控管'].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <Check size={15} className="text-success-600 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* 醫療場景輪播 */}
            <div className="relative w-full aspect-[16/10] lg:aspect-auto lg:h-[520px] rounded-2xl overflow-hidden shadow-elev-3 ring-1 ring-black/10 animate-fade-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/photos/med-1.jpg" alt="醫護人員使用行動裝置" className="absolute inset-0 w-full h-full object-cover" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/photos/med-2.jpg" alt="醫院服務櫃台" className="medfade-b absolute inset-0 w-full h-full object-cover opacity-0" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/photos/med-3.jpg" alt="明亮整潔的病房" className="medfade-c absolute inset-0 w-full h-full object-cover opacity-0" />
              {/* 底部柔和漸層,確保浮卡可讀 */}
              <div
                className="absolute inset-x-0 bottom-0 h-32 pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(15,34,51,0.35), transparent)' }}
                aria-hidden
              />
              {/* 品牌浮卡 */}
              <div className="absolute left-4 bottom-4 flex items-center gap-3 bg-white/95 backdrop-blur-sm rounded-xl pl-3 pr-5 py-2.5 shadow-elev-2">
                <Logo size={36} />
                <div className="leading-tight">
                  <p className="text-label-lg font-semibold text-on-surface">C.I.S.H</p>
                  <p className="text-caption text-on-surface-variant">醫療領域資訊安全推動中心</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════ 統計帶 ════ */}
      <section className="border-y border-outline-variant/60 bg-surface-container-lowest">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-outline-variant/60 gap-y-8">
          <Stat value={`${orgCount}`} label="服務醫療機構" sub="納管中之受稽核單位" />
          <Stat value={`${cycleCount}`} label="稽核週期" sub="歷年累計開立場次" />
          <Stat value={`${passRate}%`} label="矯正措施通過率" sub="委員審查通過比例" />
        </div>
      </section>

      {/* ════ 最新資訊 ════ */}
      <section id="news" className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full scroll-mt-16">
        <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
          <div>
            <p className="text-label text-primary-700 tracking-[0.12em] uppercase mb-3">情資與公告</p>
            <h2 className="text-headline-lg text-on-surface">最新資安資訊</h2>
          </div>
          <Link href="/news" className="text-body-sm text-primary-700 hover:underline focus-ring rounded-sm inline-flex items-center gap-0.5 mb-1">
            查看全部
            <ChevronRight size={14} />
          </Link>
        </div>
        {posts.length === 0 ? (
          <div className="rounded-lg border border-outline-variant/70 bg-surface-container-lowest">
            <EmptyState
              icon={<FileText size={26} />}
              title="尚無資安資訊"
              description="最新公告與情資將在這裡呈現,敬請期待"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {posts.map((p) => (
              <Link key={p.id} href={`/news/${p.slug}`} className="group focus-ring rounded-lg">
                <article className="relative h-full rounded-lg border border-outline-variant/70 bg-surface-container-lowest overflow-hidden transition-all duration-200 ease-standard group-hover:border-outline group-hover:shadow-elev-2 group-hover:-translate-y-0.5">
                  <div className={`h-1 ${CATEGORY_BAR[p.category as PostCategory] ?? 'bg-primary-500'}`} aria-hidden />
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-3.5">
                      <Chip tone={CATEGORY_TONE[p.category as PostCategory] ?? 'primary'} size="sm" dot>
                        {POST_CATEGORY_LABELS[p.category as PostCategory] ?? p.category}
                      </Chip>
                      {p.pinned && <Chip tone="neutral" size="sm">置頂</Chip>}
                    </div>
                    <h3 className="text-title text-on-surface leading-snug line-clamp-2 group-hover:text-primary-700 transition-colors">
                      {p.title}
                    </h3>
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-caption text-on-surface-variant tabular-nums">
                        {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                      </p>
                      <span className="inline-flex items-center gap-0.5 text-caption text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">
                        閱讀
                        <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ════ 安全特性帶 ════ */}
      <section className="border-y border-outline-variant/60 bg-surface-container-lowest">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Feature icon={<History size={18} />} title="全程稽核軌跡" desc="每一筆操作皆留存不可否認紀錄" />
          <Feature icon={<ShieldCheck size={18} />} title="角色權限分級" desc="機關資料嚴格隔離,委員迴避原則" />
          <Feature icon={<Paperclip size={18} />} title="佐證完整性驗證" desc="附件以 SHA-256 雜湊確保未遭竄改" />
        </div>
      </section>

      {/* ════ CTA 收尾 ════ */}
      <section className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full">
        <div
          className="relative overflow-hidden rounded-2xl px-8 py-14 sm:px-14 text-center"
          style={{
            background: 'linear-gradient(135deg, #1a334a 0%, #254868 55%, #2f5b88 100%)',
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 60% 80% at 85% 10%, rgba(183,215,232,0.12), transparent 60%)' }}
            aria-hidden
          />
          <h2 className="relative text-headline-lg text-white text-balance">
            讓每一次稽核都清楚、從容、留得下軌跡。
          </h2>
          <p className="relative mt-3 text-body text-primary-100/90">
            {session ? '歡迎回來,繼續您的稽核管考作業。' : '使用機關核發之帳號登入,開始本年度稽核作業。'}
          </p>
          <div className="relative mt-8 flex justify-center gap-3 flex-wrap">
            <Link
              href={enterHref}
              className="inline-flex items-center justify-center h-12 px-7 rounded-full bg-white text-primary-800 text-label-lg font-medium shadow-elev-2 hover:bg-primary-50 active:scale-[0.98] transition-all duration-200 ease-standard focus-ring"
            >
              {enterLabel}
            </Link>
            <Link
              href="/news"
              className="inline-flex items-center justify-center h-12 px-7 rounded-full border border-white/35 text-white text-label-lg font-medium hover:bg-white/10 active:scale-[0.98] transition-all duration-200 ease-standard focus-ring"
            >
              瀏覽資安資訊
            </Link>
          </div>
        </div>
      </section>

      {/* ════ Footer(前台三頁共用) ════ */}
      <PortalFooter />
    </div>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="text-center px-6">
      <p className="text-display-sm font-semibold text-on-surface tabular-nums leading-none tracking-tight">
        {value}
      </p>
      <p className="mt-3 text-body font-medium text-on-surface">{label}</p>
      <p className="mt-1 text-caption text-on-surface-variant">{sub}</p>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-on-surface">{title}</p>
        <p className="text-caption text-on-surface-variant">{desc}</p>
      </div>
    </div>
  );
}
