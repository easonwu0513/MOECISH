import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { Chip } from '@/components/ui/Chip';
import { ChevronLeft } from '@/components/icons';
import { Markdown } from '@/lib/markdown';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalFooter } from '@/components/portal/PortalFooter';
import { POST_CATEGORY_LABELS, type PostCategory } from '@/lib/types';
import { POST_CATEGORY_TONE } from '@/lib/tone';

export const dynamic = 'force-dynamic';

export default async function NewsDetailPage({ params }: { params: { slug: string } }) {
  const session = await auth();
  const post = await prisma.post.findUnique({
    where: { slug: params.slug },
    include: { attachments: { orderBy: { id: 'asc' } } },
  });
  if (!post || post.status !== 'PUBLISHED') notFound();

  return (
    <div className="min-h-screen bg-paper-sunk flex flex-col">
      <PortalHeader authed={!!session} />

      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        <Link
          href="/news"
          className="inline-flex items-center gap-1 text-body-sm text-ink-500 hover:text-primary-700 transition-colors focus-ring rounded-sm mb-6"
        >
          <ChevronLeft size={15} />
          返回資安資訊
        </Link>

        <article>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <Chip tone={POST_CATEGORY_TONE[post.category as PostCategory] ?? 'primary'} size="sm" dot>
              {POST_CATEGORY_LABELS[post.category as PostCategory] ?? post.category}
            </Chip>
            {post.important && <Chip tone="danger" size="sm">重要</Chip>}
          </div>
          <h1 className="text-headline-lg text-ink-900 text-balance leading-snug">{post.title}</h1>
          <p className="mt-3 text-caption text-ink-500 tabular-nums">
            發布於{' '}
            {post.publishedAt
              ? new Date(post.publishedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
              : ''}
          </p>

          {/* 收斂閱讀行寬,長文不致一行過長(首頁已大量採 ch 量度) */}
          <div className="mt-8 border-t border-rule pt-8 max-w-[70ch]">
            <Markdown content={post.contentMd} />
          </div>

          {/* 附件下載(公告附件公開;下載端 attachment+nosniff) */}
          {post.attachments.length > 0 && (
            <div className="mt-8 rounded-lg border border-rule bg-paper-sunk p-4 max-w-[70ch]">
              <p className="text-title text-ink-900 mb-2">附件下載</p>
              <ul className="flex flex-col gap-1.5">
                {post.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-body-sm min-w-0">
                    <a
                      href={`/api/post-attachments/${a.id}/download`}
                      className="text-primary-700 hover:underline truncate focus-ring rounded-sm"
                    >
                      {a.fileName}
                    </a>
                    <span className="shrink-0 text-caption text-ink-500 tabular-nums">
                      {a.sizeBytes >= 1024 * 1024 ? `${(a.sizeBytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(a.sizeBytes / 1024))} KB`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 文末收尾動線 */}
          <div className="mt-10 pt-6 border-t border-rule">
            <Link
              href="/news"
              className="inline-flex items-center gap-1.5 text-body-sm text-ink-500 hover:text-ink-900 transition-colors focus-ring rounded-sm"
            >
              <ChevronLeft size={15} />
              返回資安資訊列表
            </Link>
          </div>
        </article>
      </main>

      <PortalFooter />
    </div>
  );
}
