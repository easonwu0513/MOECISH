/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
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
import { TONE, POST_CATEGORY_TONE } from '@/lib/tone';

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

/** Hero 精選 6 張醫療×資安場景照片(明亮專業、依序交錯輪播):
 *  醫療場域(病房/診間/櫃台)× 醫療高階設備 × 資安機房 × 稽核作業,四類均衡呈現。 */
const HERO_PHOTOS = [
  { src: '/photos/med-3.jpg', alt: '明亮整潔的病房' },
  { src: '/photos/med-6.jpg', alt: '明亮資料中心機房' },
  { src: '/photos/med-7.jpg', alt: '明亮現代化診間' },
  { src: '/photos/med-9.jpg', alt: '醫療機器人放射治療系統' },
  { src: '/photos/med-2.jpg', alt: '明亮醫院服務櫃台' },
  { src: '/photos/med-4.jpg', alt: '資安稽核文件審閱與工作底稿' },
];

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

  // 精選固定 6 張依序輪播(不再隨機挑選)
  const heroPhotos = HERO_PHOTOS;

  const important = posts.find((p) => p.important);
  const enterHref = session ? '/dashboard' : '/login';
  const enterLabel = session ? '進入系統' : '登入系統';

  return (
    <div className="min-h-screen bg-paper-sunk flex flex-col">
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
      {/* 六張輪播:36s 一輪,每張 ~6s,交疊 1s 淡入淡出;第 1 張常駐底層。
          keyframes 與 .medfade-* 已收進 globals.css(批76),並於 prefers-reduced-motion 停在第一張。 */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-hero-ambient" aria-hidden />
        <div className="relative max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-20 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_440px] items-center gap-12 lg:gap-x-16">
            {/* 文案 */}
            <div className="max-w-2xl animate-slide-up">
              <Eyebrow>教育部轄下醫療領域資訊安全推動中心</Eyebrow>
              <h1 className="mt-4 text-display sm:text-display-lg text-ink-900 text-balance font-semibold leading-[1.05] tracking-tight">
                資通安全稽核
                <br />
                管考平台
              </h1>
              <p className="mt-7 border-l-2 border-primary-200 pl-5 text-body-lg text-ink-500 max-w-[34ch] text-pretty leading-relaxed">
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
              <ul className="mt-12 pt-8 border-t border-rule flex items-center gap-x-7 gap-y-3 flex-wrap text-body-sm text-ink-500">
                {['對齊教育部稽核範本', '全程稽核軌跡留存', '角色權限分級控管'].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <Check size={15} className="text-success-600 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* 醫療 × 稽核場景輪播(六張交錯) */}
            <div className="relative w-full aspect-[16/10] lg:aspect-auto lg:h-[520px] rounded-2xl overflow-hidden ring-1 ring-ink-900/10 animate-fade-in shadow-elev-3">
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
            </div>
          </div>
        </div>
      </section>

      {/* ════ 統計帶(制度規模,非營運數據;對外恆穩) ════ */}
      <section className="border-y border-rule bg-card">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-rule gap-y-8">
          {/* 制度服務對象固定 9 間(臺大附醫體系 6+成大 2+陽明交大 1),非 DB 筆數 */}
          <Stat value="9" label="服務醫療機構" sub="教育部所屬大學附設醫院體系" />
          <Stat value="9" label="稽核構面" sub="策略、管理、技術全面涵蓋" />
          <Stat value={`${itemCount}`} label="檢核項目" sub="對齊行政院年度檢核表並附法規對照" />
        </div>
      </section>

      {/* ════ 最新資訊 ════ */}
      <section id="news" className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-24 w-full scroll-mt-16">
        <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
          <div>
            <Eyebrow>情資與公告</Eyebrow>
            <h2 className="mt-3 text-headline-lg text-ink-900">最新資安資訊</h2>
            <SectionRule />
          </div>
          <Link href="/news" className="group/all relative text-body-sm text-primary-700 focus-ring rounded-sm inline-flex items-center gap-0.5 mb-1 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:bg-primary-300 after:origin-left after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-200">
            查看全部
            <ChevronRight size={14} />
          </Link>
        </div>
        {posts.length === 0 ? (
          <div className="rounded-lg border border-rule bg-card">
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
                <article className="relative h-full rounded-lg border border-rule bg-card overflow-hidden transition-[border-color,box-shadow,transform] duration-200 ease-standard group-hover:border-primary-200 group-hover:shadow-elev-1 group-active:scale-[0.99] group-active:border-primary-300">
                  <div className={`h-0.5 ${TONE[POST_CATEGORY_TONE[p.category as PostCategory] ?? 'primary'].dot}`} aria-hidden />
                  <div className="p-7">
                    <div className="flex items-center gap-2 mb-3.5">
                      <Chip tone={POST_CATEGORY_TONE[p.category as PostCategory] ?? 'primary'} size="sm" dot>
                        {POST_CATEGORY_LABELS[p.category as PostCategory] ?? p.category}
                      </Chip>
                      {p.pinned && <Chip tone="neutral" size="sm">置頂</Chip>}
                    </div>
                    <h3 className="text-title-md text-ink-900 leading-snug line-clamp-2 group-hover:text-primary-700 transition-colors">
                      {p.title}
                    </h3>
                    {excerpt(p.contentMd) && (
                      <p className="mt-2 text-body-sm text-ink-500 line-clamp-2 leading-relaxed">
                        {excerpt(p.contentMd)}
                      </p>
                    )}
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-caption text-ink-500 tabular-nums">
                        {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                      </p>
                      {/* 常駐低調顯示(觸控裝置無 hover,純 hover 顯示等於永遠看不到) */}
                      <span className="inline-flex items-center gap-0.5 text-caption text-ink-500 group-hover:text-primary-700 transition-colors">
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
      <section className="border-y border-rule bg-card">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="mb-8">
            <Eyebrow>資安治理基線</Eyebrow>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:divide-x sm:divide-rule">
            <Feature icon={<History size={18} />} title="全程稽核軌跡" desc="每一筆操作皆留存不可否認紀錄" />
            <Feature icon={<ShieldCheck size={18} />} title="角色權限分級" desc="機關資料嚴格隔離,委員迴避原則" />
            <Feature icon={<Paperclip size={18} />} title="佐證完整性驗證" desc="附件以 SHA-256 雜湊確保未遭竄改" />
          </div>
        </div>
      </section>

      {/* ════ CTA 收尾 ════ */}
      <section className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-24 w-full">
        {/* 深藍憲章招牌(批76):深藍實心面 bg-cta-surface(primary-800→900)+ 單一極細內框 hairline,
            取代原手抄三段漸層 #1a334a→#2f5b88 + glow + 白 repeating-hairline。 */}
        <div className="relative overflow-hidden rounded-xl px-8 py-14 sm:px-14 text-center bg-cta-surface ring-1 ring-inset ring-white/10">
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
              className="inline-flex items-center justify-center h-12 px-7 rounded-full bg-card text-primary-800 text-label-lg font-medium shadow-elev-2-hi hover:bg-primary-50 active:scale-[0.98] transition-all duration-200 ease-standard focus-ring"
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
      <p className="text-display font-semibold text-ink-900 tabular-nums leading-none tracking-tight">
        {value}
      </p>
      {/* 官印刻度線:寬度刻意小於數字,做「下劃刻度」而非底線 */}
      <span className="mx-auto mt-4 block h-0.5 w-8 rounded-full bg-primary-300" aria-hidden />
      <p className="mt-4 text-label text-ink-900 uppercase tracking-[0.08em]">{label}</p>
      <p className="mt-1.5 max-w-[22ch] mx-auto text-caption text-ink-500 leading-relaxed">{sub}</p>
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
        <p className="text-body-sm font-medium text-ink-900">{title}</p>
        <p className="max-w-[26ch] text-caption text-ink-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
