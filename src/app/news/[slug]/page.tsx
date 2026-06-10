import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { Wordmark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ChevronLeft } from '@/components/icons';
import { Markdown } from '@/lib/markdown';
import { POST_CATEGORY_LABELS, type PostCategory } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CATEGORY_TONE: Record<PostCategory, 'primary' | 'sage' | 'danger' | 'warning'> = {
  ANNOUNCEMENT: 'primary',
  INTEL: 'sage',
  VULN_ALERT: 'danger',
  EVENT: 'warning',
};

export default async function NewsDetailPage({ params }: { params: { slug: string } }) {
  const session = await auth();
  const post = await prisma.post.findUnique({ where: { slug: params.slug } });
  if (!post || post.status !== 'PUBLISHED') notFound();

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-sm border-b border-outline-variant/60">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="focus-ring rounded-md"><Wordmark /></Link>
          <nav className="flex items-center gap-2">
            {session ? (
              <Link href="/dashboard"><Button size="sm">進入系統</Button></Link>
            ) : (
              <Link href="/login"><Button size="sm">登入</Button></Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        <Link
          href="/news"
          className="inline-flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-primary-700 transition-colors focus-ring rounded-sm mb-6"
        >
          <ChevronLeft size={15} />
          返回資安資訊
        </Link>

        <article>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <Chip tone={CATEGORY_TONE[post.category as PostCategory] ?? 'primary'} size="sm" dot>
              {POST_CATEGORY_LABELS[post.category as PostCategory] ?? post.category}
            </Chip>
            {post.important && <Chip tone="danger" size="sm">重要</Chip>}
          </div>
          <h1 className="text-headline-lg text-on-surface text-balance leading-snug">{post.title}</h1>
          <p className="mt-3 text-caption text-on-surface-variant tabular-nums">
            發布於{' '}
            {post.publishedAt
              ? new Date(post.publishedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
              : ''}
          </p>

          <div className="mt-8 border-t border-outline-variant/60 pt-8">
            <Markdown content={post.contentMd} />
          </div>
        </article>
      </main>

      <footer className="border-t border-outline-variant/60">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-caption text-on-surface-variant">
          MOECISH · 教育部資通安全稽核改善管考系統
        </div>
      </footer>
    </div>
  );
}
