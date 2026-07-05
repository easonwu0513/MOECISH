import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Plus } from '@/components/icons';
import { POST_CATEGORY_LABELS, type PostCategory, type PostStatus } from '@/lib/types';
import { fmtROCDateTime } from '@/lib/date';

const STATUS_LABEL: Record<PostStatus, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已發布',
  ARCHIVED: '已下架',
};
const STATUS_TONE: Record<PostStatus, 'neutral' | 'success' | 'warning'> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  ARCHIVED: 'warning',
};

export default async function AdminPostsPage() {
  const session = await auth();
  const user = session!.user;

  const posts = await prisma.post.findMany({
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理' }, { label: '公告管理' }]}
    >
      {/* ── 文件大標(黑體)+ 動作;公文式底規線 ── */}
      <header className="mb-9 pb-5 border-b border-rule flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-headline-lg text-ink-900 tracking-tight">公告管理</h1>
          <p className="mt-2.5 text-body-sm text-ink-500 max-w-2xl leading-relaxed">
            發布於前台的資安資訊;僅「已發布」狀態會對外顯示。
          </p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <Link href="/admin/posts/new">
            <Button size="sm" leadingIcon={<Plus size={15} />}>新增公告</Button>
          </Link>
        </div>
      </header>

      {posts.length === 0 ? (
        <div className="rounded-md border border-rule bg-card px-6 py-14 text-center">
          <p className="text-title text-ink-700">尚無公告</p>
          <p className="mt-1.5 text-body-sm text-ink-500">點右上「新增公告」開始。</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-rule bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-rule-strong bg-paper-sunk text-left text-caption text-ink-500">
                  <th className="px-4 py-2.5 font-medium">標題</th>
                  <th className="px-4 py-2.5 font-medium">分類</th>
                  <th className="px-4 py-2.5 font-medium">狀態</th>
                  <th className="px-4 py-2.5 font-medium text-right">發布時間</th>
                  <th className="px-4 py-2.5 font-medium text-right">編輯</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} className="border-b border-rule last:border-b-0 hover:bg-paper-sunk transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {p.important && <Chip tone="danger" size="sm">重要</Chip>}
                        {p.pinned && <Chip tone="neutral" size="sm">置頂</Chip>}
                        <span className="font-medium text-ink-900">{p.title}</span>
                      </div>
                      <span className="block text-caption font-mono text-ink-500 mt-0.5">/news/{p.slug}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone="primary" size="sm">{POST_CATEGORY_LABELS[p.category as PostCategory] ?? p.category}</Chip>
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone={STATUS_TONE[p.status as PostStatus]} size="sm" dot>
                        {STATUS_LABEL[p.status as PostStatus]}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-caption text-ink-500">
                      {p.publishedAt ? fmtROCDateTime(p.publishedAt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/posts/${p.id}`} className="text-primary-700 hover:underline">編輯</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
