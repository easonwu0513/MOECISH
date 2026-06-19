/* eslint-disable @next/next/no-img-element */
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
  ClipboardCheck,
  Eye,
  AlertTriangle,
} from '@/components/icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { POST_CATEGORY_LABELS, type PostCategory } from '@/lib/types';

/** Markdown → 純文字摘要(新聞卡用,僅去符號不渲染)。 */
function excerpt(md: string, len = 64): string {
  const text = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > len ? `${text.slice(0, len)}…` : text;
}

export const dynamic = 'force-dynamic';

/** Hero 醫療×資安場景照片池(明亮專業);每次載入隨機選 6 張交錯輪播。 */
const PHOTO_POOL = [
  // 醫院場域
  { src: '/photos/med-2.jpg', alt: '明亮醫院服務櫃台' },
  { src: '/photos/med-3.jpg', alt: '明亮整潔的病房' },
  { src: '/photos/med-7.jpg', alt: '明亮現代化診間' },
  { src: '/photos/med-1.jpg', alt: '醫護人員使用行動裝置' },
  { src: '/photos/med-8.jpg', alt: '病患生理監測儀器' },
  // 達文西 / 醫療機器人儀器
  { src: '/photos/med-9.jpg', alt: '醫療機器人手術系統機械臂' },
  { src: '/photos/med-11.jpg', alt: '醫療機器人放射治療系統' },
  // 資安機房 / 醫療資安
  { src: '/photos/med-6.jpg', alt: '明亮資料中心機房' },
  { src: '/photos/med-5.jpg', alt: '資料中心機房與伺服器' },
  { src: '/photos/med-10.jpg', alt: '資安監控數據儀表板' },
  { src: '/photos/med-4.jpg', alt: '資安稽核文件審閱與工作底稿' },
];

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

  const [posts, latestVersion] = await Promise.all([
    prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      take: 6,
      select: { id: true, slug: true, category: true, title: true, contentMd: true, important: true, pinned: true, publishedAt: true },
    }),
    // 檢核項目題數取題數最完整的題庫版本(對外展示制度規模,非營運數據)
    prisma.checklistVersion.findFirst({
      where: { items: { some: {} } },
      orderBy: { items: { _count: 'desc' } },
      include: { _count: { select: { items: true } } },
    }),
  ]);

  const itemCount = latestVersion?._count.items ?? 87;

  // 每次載入隨機選 6 張(打散順序),讓 Hero 輪播更隨機、不固定
  const heroPhotos = [...PHOTO_POOL].sort(() => Math.random() - 0.5).slice(0, 6);

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
            {/* 兩層紅點:常駐實心 + 外圈脈衝(reduced-motion 下仍有清楚紅點) */}
            <span className="relative flex w-2 h-2 shrink-0" aria-hidden>
              <span className="animate-soft-pulse absolute inline-flex h-full w-full rounded-full bg-danger-400" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-danger-500" />
            </span>
            <span className="font-semibold shrink-0">重要</span>
            <span className="truncate">{important.title}</span>
            <ChevronRight size={14} className="shrink-0 ml-auto" />
          </div>
        </Link>
      )}

      {/* ════ Hero ════ */}
      <section className="relative overflow-hidden">
        {/* 六張輪播:36s 一輪,每張 ~6s,交疊 1s 淡入淡出;第 1 張常駐底層 */}
        <style>{`
          @keyframes medfade2 { 0%, 13.9% { opacity: 0 } 16.7%, 30.5% { opacity: 1 } 33.4%, 100% { opacity: 0 } }
          @keyframes medfade3 { 0%, 30.5% { opacity: 0 } 33.4%, 47.2% { opacity: 1 } 50.1%, 100% { opacity: 0 } }
          @keyframes medfade4 { 0%, 47.2% { opacity: 0 } 50.1%, 63.9% { opacity: 1 } 66.8%, 100% { opacity: 0 } }
          @keyframes medfade5 { 0%, 63.9% { opacity: 0 } 66.8%, 80.5% { opacity: 1 } 83.4%, 100% { opacity: 0 } }
          @keyframes medfade6 { 0%, 80.5% { opacity: 0 } 83.4%, 97.2% { opacity: 1 } 100% { opacity: 0 } }
          .medfade-2 { animation: medfade2 36s ease-in-out infinite }
          .medfade-3 { animation: medfade3 36s ease-in-out infinite }
          .medfade-4 { animation: medfade4 36s ease-in-out infinite }
          .medfade-5 { animation: medfade5 36s ease-in-out infinite }
          .medfade-6 { animation: medfade6 36s ease-in-out infinite }
        `}</style>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 75% 65% at 10% 0%, rgba(40,82,160,0.07), transparent 65%)',
          }}
          aria-hidden
        />
        <div className="relative max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-20 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_440px] items-center gap-12 lg:gap-x-16">
            {/* 文案 */}
            <div className="max-w-2xl animate-slide-up">
              <Eyebrow>教育部轄下醫療領域資訊安全推動中心</Eyebrow>
              <h1 className="mt-4 text-display sm:text-display-lg text-on-surface text-balance font-semibold leading-[1.05] tracking-tight">
                資通安全稽核
                <br />
                管考平台
              </h1>
              <p className="mt-7 border-l-2 border-primary-200 pl-5 text-body-lg text-on-surface-variant max-w-[34ch] text-pretty leading-relaxed">
                讓每一次稽核都清楚、從容、留得下軌跡。
                從稽核前資料準備、缺失矯正填報到委員審查結案，
                一站式完成醫療機構資通安全稽核管考作業。
              </p>
              <div className="mt-10 flex gap-3 flex-wrap">
                <Link href={enterHref}>
                  <Button size="lg">{enterLabel}</Button>
                </Link>
                <Link href="/news">
                  <Button size="lg" variant="tonal">瀏覽資安資訊</Button>
                </Link>
              </div>
              {/* 信任徽記 */}
              <ul className="mt-12 pt-8 border-t border-outline-variant/50 flex items-center gap-x-7 gap-y-3 flex-wrap text-body-sm text-on-surface-variant">
                {['對齊教育部稽核範本', '全程稽核軌跡留存', '角色權限分級控管'].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <Check size={15} className="text-success-600 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* 醫療 × 稽核場景輪播(六張交錯) */}
            <div
              className="relative w-full aspect-[16/10] lg:aspect-auto lg:h-[520px] rounded-2xl overflow-hidden ring-1 ring-on-surface/10 animate-fade-in"
              style={{ boxShadow: '0 1px 3px 0 rgba(24,36,56,0.10), 0 4px 10px 3px rgba(24,36,56,0.06), inset 0 1px 0 rgba(255,255,255,0.5)' }}
            >
              {heroPhotos.map((p, i) => (
                <img
                  key={p.src}
                  src={p.src}
                  alt={p.alt}
                  className={
                    i === 0
                      ? 'absolute inset-0 w-full h-full object-cover'
                      : `medfade-${i + 1} absolute inset-0 w-full h-full object-cover opacity-0`
                  }
                />
              ))}
              {/* 底部柔和漸層,確保浮卡可讀 */}
              <div
                className="absolute inset-x-0 bottom-0 h-32 pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(15,34,51,0.42), transparent)' }}
                aria-hidden
              />
              {/* 品牌浮卡 */}
              <div
                className="absolute left-4 bottom-4 flex items-center gap-3 bg-white/95 backdrop-blur-sm rounded-xl pl-3 pr-5 py-2.5 shadow-elev-2"
                style={{ boxShadow: '0 1px 2px 0 rgba(24,36,56,0.08), 0 2px 6px 2px rgba(24,36,56,0.05), inset 0 1px 0 rgba(255,255,255,0.7)' }}
              >
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

      {/* ════ 統計帶(制度規模,非營運數據;對外恆穩) ════ */}
      <section className="border-y border-outline-variant/60 bg-surface-container-lowest">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-outline-variant/40 gap-y-8">
          {/* 制度服務對象固定 9 間(臺大附醫體系 6+成大 2+陽明交大 1),非 DB 筆數 */}
          <Stat value="9" label="服務醫療機構" sub="教育部所屬大學附設醫院體系" />
          <Stat value="9" label="稽核構面" sub="策略、管理、技術全面涵蓋" />
          <Stat value={`${itemCount}`} label="檢核項目" sub="對齊行政院年度檢核表並附法規對照" />
        </div>
      </section>

      {/* ════ 平台服務 ════ */}
      <section className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-4 w-full">
        <div className="mb-8">
          <Eyebrow>平台服務</Eyebrow>
          <h2 className="mt-3 text-headline-lg text-on-surface">稽核全流程,一站完成</h2>
          <SectionRule />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <ServiceCard
            icon={<FileText size={20} />}
            step="01"
            title="稽核前資料準備"
            desc="受稽機關線上繳交應備文件,委員逐項確認齊備,實地稽核當天不再翻箱倒櫃。"
          />
          <ServiceCard
            icon={<ClipboardCheck size={20} />}
            step="02"
            title="檢核表線上填報"
            desc="行政院檢核項目逐題作答,每題附稽核依據與應備文件對照,填完一鍵送出。"
          />
          <ServiceCard
            icon={<Eye size={20} />}
            step="03"
            title="實地稽核數位化"
            desc="委員線上評分與輸入發現,系統當日自動彙整成正式報告,即看即印。"
          />
          <ServiceCard
            icon={<AlertTriangle size={20} />}
            step="04"
            title="缺失矯正管考"
            desc="缺失自動開立、矯正填報與佐證上傳、委員審查與逾期提醒,一路追蹤到結案。"
          />
        </div>
      </section>

      {/* ════ 最新資訊 ════ */}
      <section id="news" className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-24 w-full scroll-mt-16">
        <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
          <div>
            <Eyebrow>情資與公告</Eyebrow>
            <h2 className="mt-3 text-headline-lg text-on-surface">最新資安資訊</h2>
            <SectionRule />
          </div>
          <Link href="/news" className="group/all relative text-body-sm text-primary-700 focus-ring rounded-sm inline-flex items-center gap-0.5 mb-1 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:bg-primary-300 after:origin-left after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-200">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((p) => (
              <Link key={p.id} href={`/news/${p.slug}`} className="group focus-ring rounded-lg">
                <article className="relative h-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest overflow-hidden transition-colors duration-200 ease-standard group-hover:border-primary-200">
                  <div className={`h-0.5 ${CATEGORY_BAR[p.category as PostCategory] ?? 'bg-primary-500'}`} aria-hidden />
                  <div className="p-7">
                    <div className="flex items-center gap-2 mb-3.5">
                      <Chip tone={CATEGORY_TONE[p.category as PostCategory] ?? 'primary'} size="sm" dot>
                        {POST_CATEGORY_LABELS[p.category as PostCategory] ?? p.category}
                      </Chip>
                      {p.pinned && <Chip tone="neutral" size="sm">置頂</Chip>}
                    </div>
                    <h3 className="text-title-md text-on-surface leading-snug line-clamp-2 group-hover:text-primary-700 transition-colors">
                      {p.title}
                    </h3>
                    {excerpt(p.contentMd) && (
                      <p className="mt-2 text-body-sm text-on-surface-variant line-clamp-2 leading-relaxed">
                        {excerpt(p.contentMd)}
                      </p>
                    )}
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-caption text-on-surface-variant tabular-nums font-mono">
                        {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''}
                      </p>
                      {/* 常駐低調顯示(觸控裝置無 hover,純 hover 顯示等於永遠看不到) */}
                      <span className="inline-flex items-center gap-0.5 text-caption text-on-surface-variant/70 group-hover:text-primary-700 transition-colors">
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
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="mb-8">
            <Eyebrow>資安治理基線</Eyebrow>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:divide-x sm:divide-outline-variant/40">
            <Feature icon={<History size={18} />} title="全程稽核軌跡" desc="每一筆操作皆留存不可否認紀錄" />
            <Feature icon={<ShieldCheck size={18} />} title="角色權限分級" desc="機關資料嚴格隔離,委員迴避原則" />
            <Feature icon={<Paperclip size={18} />} title="佐證完整性驗證" desc="附件以 SHA-256 雜湊確保未遭竄改" />
          </div>
        </div>
      </section>

      {/* ════ CTA 收尾 ════ */}
      <section className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-24 w-full">
        <div
          className="relative overflow-hidden rounded-xl px-8 py-14 sm:px-14 text-center"
          style={{
            background: 'linear-gradient(135deg, #1a334a 0%, #254868 55%, #2f5b88 100%)',
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 60% 80% at 85% 10%, rgba(183,215,232,0.12), transparent 60%)' }}
            aria-hidden
          />
          {/* 官方文件封面質地:極細等距白 hairline */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.06]"
            style={{ backgroundImage: 'repeating-linear-gradient(135deg,#fff 0 1px,transparent 1px 14px)' }}
            aria-hidden
          />
          <p className="relative text-label text-primary-200 uppercase tracking-[0.08em] mb-4">開始本年度稽核作業</p>
          <h2 className="relative text-headline-lg text-white text-balance tracking-tight">
            從資料準備到結案追蹤,一個平台完成。
          </h2>
          <p className="relative mt-3 text-body text-primary-100/90">
            {session ? '歡迎回來,繼續您的稽核管考作業。' : '使用機關核發之帳號登入,開始本年度稽核作業。'}
          </p>
          <div className="relative mt-8 flex justify-center gap-3 flex-wrap">
            <Link
              href={enterHref}
              className="inline-flex items-center justify-center h-12 px-7 rounded-full bg-white text-primary-800 text-label-lg font-medium shadow-elev-2 hover:bg-primary-50 active:scale-[0.98] transition-all duration-200 ease-standard focus-ring"
              style={{ boxShadow: '0 1px 2px 0 rgba(24,36,56,0.08), 0 2px 6px 2px rgba(24,36,56,0.05), inset 0 1px 0 rgba(255,255,255,0.9)' }}
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

/** 章節抬頭印記(直立分隔條 + overline 小字);含中文故用 0.08em 字距。 */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 text-label text-primary-700 uppercase tracking-[0.08em]">
      <span className="h-3.5 w-0.5 rounded-full bg-primary-700" aria-hidden />
      {children}
    </p>
  );
}

/** 章節記號:標題下方的 primary 短刻度線。 */
function SectionRule() {
  return <div className="mt-4 h-0.5 w-12 rounded-full bg-primary-300" aria-hidden />;
}

function Stat({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="text-center px-6">
      <p className="text-display font-semibold text-on-surface tabular-nums leading-none tracking-tight">
        {value}
      </p>
      {/* 官印刻度線:寬度刻意小於數字,做「下劃刻度」而非底線 */}
      <span className="mx-auto mt-4 block h-0.5 w-8 rounded-full bg-primary-300" aria-hidden />
      <p className="mt-4 text-label text-on-surface uppercase tracking-[0.08em]">{label}</p>
      <p className="mt-1.5 max-w-[22ch] mx-auto text-caption text-on-surface-variant leading-relaxed">{sub}</p>
    </div>
  );
}

function ServiceCard({
  icon, step, title, desc,
}: {
  icon: React.ReactNode;
  step: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="relative h-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-7 transition-colors duration-200 ease-standard hover:border-primary-200 hover:bg-surface-container-low">
      <div className="flex items-center justify-between mb-4">
        <div className="w-11 h-11 rounded-md bg-primary-50 ring-1 ring-primary-100 text-primary-700 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-display-sm font-semibold text-primary-100 leading-none select-none" aria-hidden>
          {step}
        </span>
      </div>
      <p className="text-title-md text-on-surface">{title}</p>
      <p className="mt-2 max-w-[30ch] text-body-sm text-on-surface-variant leading-relaxed">{desc}</p>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-4 sm:px-6">
      <div className="w-10 h-10 rounded-md bg-transparent ring-1 ring-primary-200 text-primary-700 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-on-surface">{title}</p>
        <p className="max-w-[26ch] text-caption text-on-surface-variant leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
