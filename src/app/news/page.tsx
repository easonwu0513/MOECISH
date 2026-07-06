import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { Chip } from '@/components/ui/Chip';
import { Card } from '@/components/ui/Card';
import { FilterChipLink, FilterChipCount } from '@/components/ui/FilterChip';
import { ChevronRight, FileText } from '@/components/icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalFooter } from '@/components/portal/PortalFooter';
import { POST_CATEGORIES, POST_CATEGORY_LABELS, type PostCategory } from '@/lib/types';
import { POST_CATEGORY_TONE } from '@/lib/tone';
import { fmtROC } from '@/lib/date';

export const dynamic = 'force-dynamic';

export default async function NewsPage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const session = await auth();
  const category = POST_CATEGORIES.includes(searchParams.category as PostCategory)
    ? (searchParams.category as PostCategory)
    : undefined;

  const [posts, catCounts] = await Promise.all([
    prisma.post.findMany({
      where: { status: 'PUBLISHED', ...(category ? { category } : {}) },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      take: 50,
      select: { id: true, slug: true, category: true, title: true, important: true, pinned: true, publishedAt: true },
    }),
    prisma.post.groupBy({ by: ['category'], where: { status: 'PUBLISHED' }, _count: true }),
  ]);
  const countByCat = Object.fromEntries(catCounts.map((c) => [c.category, c._count])) as Record<string, number>;
  const totalCount = catCounts.reduce((s, c) => s + c._count, 0);

  return (
    <div className="min-h-screen bg-paper-sunk flex flex-col">
      <PortalHeader authed={!!session} />

      <main className="flex-1 max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        <header className="mb-6">
          <h1 className="text-headline-lg text-ink-900">資安資訊</h1>
          <p className="mt-1 text-body text-ink-500">平台公告、資安情資、漏洞警訊與活動訊息。</p>
        </header>

        {/* 分類 tabs(統一 FilterChip + 計數,與系統內篩選同語彙) */}
        <div className="flex gap-1.5 flex-wrap mb-6 border-b border-rule pb-3" role="group" aria-label="篩選分類">
          <FilterChipLink href="/news" selected={!category}>
            全部 <FilterChipCount selected={!category}>{totalCount}</FilterChipCount>
          </FilterChipLink>
          {POST_CATEGORIES.map((c) => (
            <FilterChipLink key={c} href={`/news?category=${c}`} selected={category === c}>
              {POST_CATEGORY_LABELS[c]} <FilterChipCount selected={category === c}>{countByCat[c] ?? 0}</FilterChipCount>
            </FilterChipLink>
          ))}
        </div>

        {posts.length === 0 ? (
          <Card variant="outlined">
            <EmptyState icon={<FileText size={26} />} title="此分類暫無內容" description="切換上方分類查看其他資安資訊。" />
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {posts.map((p) => (
              <Link key={p.id} href={`/news/${p.slug}`} className="group focus-ring rounded-lg">
                <article className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 rounded-lg border border-rule bg-card px-5 py-4 transition-all duration-200 ease-standard group-hover:border-rule-strong group-hover:shadow-elev-1">
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    <Chip tone={POST_CATEGORY_TONE[p.category as PostCategory] ?? 'primary'} size="sm" dot>
                      {POST_CATEGORY_LABELS[p.category as PostCategory] ?? p.category}
                    </Chip>
                    {p.important && <Chip tone="danger" size="sm">重要</Chip>}
                    {p.pinned && <Chip tone="neutral" size="sm">置頂</Chip>}
                  </div>
                  <h2 className="flex-1 min-w-0 text-body font-medium text-ink-900 sm:truncate group-hover:text-primary-700 transition-colors">
                    {p.title}
                  </h2>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <span className="text-caption text-ink-500 tabular-nums">
                      {/* 桌面=民國年全格式(全掃 P2 去西曆年);手機=月/日短格式(無年,不涉紀年矛盾) */}
                      <span className="hidden sm:inline">{fmtROC(p.publishedAt)}</span>
                      <span className="sm:hidden">
                        {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : ''}
                      </span>
                    </span>
                    <ChevronRight size={16} className="text-ink-500" />
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </main>

      <PortalFooter />
    </div>
  );
}
