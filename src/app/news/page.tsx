import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { Chip } from '@/components/ui/Chip';
import { ChevronRight, FileText } from '@/components/icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalFooter } from '@/components/portal/PortalFooter';
import { POST_CATEGORIES, POST_CATEGORY_LABELS, type PostCategory } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CATEGORY_TONE: Record<PostCategory, 'primary' | 'sage' | 'danger' | 'warning'> = {
  ANNOUNCEMENT: 'primary',
  INTEL: 'sage',
  VULN_ALERT: 'danger',
  EVENT: 'warning',
};

export default async function NewsPage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const session = await auth();
  const category = POST_CATEGORIES.includes(searchParams.category as PostCategory)
    ? (searchParams.category as PostCategory)
    : undefined;

  const posts = await prisma.post.findMany({
    where: { status: 'PUBLISHED', ...(category ? { category } : {}) },
    orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    take: 50,
    select: { id: true, slug: true, category: true, title: true, important: true, pinned: true, publishedAt: true },
  });

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PortalHeader authed={!!session} />

      <main className="flex-1 max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        <header className="mb-6">
          <h1 className="text-headline-lg text-on-surface">資安資訊</h1>
          <p className="mt-1 text-body text-on-surface-variant">平台公告、資安情資、漏洞警訊與活動訊息。</p>
        </header>

        {/* 分類 tabs */}
        <div className="flex gap-1.5 flex-wrap mb-6">
          <Link href="/news" className="focus-ring rounded-full">
            <Chip tone={!category ? 'primary' : 'neutral'} size="md">全部</Chip>
          </Link>
          {POST_CATEGORIES.map((c) => (
            <Link key={c} href={`/news?category=${c}`} className="focus-ring rounded-full">
              <Chip tone={category === c ? 'primary' : 'neutral'} size="md">
                {POST_CATEGORY_LABELS[c]}
              </Chip>
            </Link>
          ))}
        </div>

        {posts.length === 0 ? (
          <div className="rounded-lg border border-outline-variant/70 bg-surface-container-lowest">
            <EmptyState icon={<FileText size={26} />} title="此分類暫無內容" description="切換上方分類查看其他資安資訊。" />
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {posts.map((p) => (
              <Link key={p.id} href={`/news/${p.slug}`} className="group focus-ring rounded-lg">
                <article className="flex items-center gap-3 rounded-lg border border-outline-variant/70 bg-surface-container-lowest px-5 py-4 transition-all duration-200 ease-standard group-hover:border-outline group-hover:shadow-elev-1">
                  <Chip tone={CATEGORY_TONE[p.category as PostCategory] ?? 'primary'} size="sm" dot>
                    {POST_CATEGORY_LABELS[p.category as PostCategory] ?? p.category}
                  </Chip>
                  {p.important && <Chip tone="danger" size="sm" className="shrink-0">重要</Chip>}
                  {p.pinned && <Chip tone="neutral" size="sm" className="shrink-0">置頂</Chip>}
                  <h2 className="flex-1 min-w-0 text-body font-medium text-on-surface truncate group-hover:text-primary-700 transition-colors">
                    {p.title}
                  </h2>
                  <span className="text-caption text-on-surface-variant tabular-nums shrink-0">
                    {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                  </span>
                  <ChevronRight size={16} className="text-on-surface-variant shrink-0" />
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
