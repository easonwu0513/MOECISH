import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileText, Plus } from '@/components/icons';
import { POST_CATEGORY_LABELS, type PostCategory, type PostStatus } from '@/lib/types';

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
      crumbs={[{ label: '管理', href: '/admin/organizations' }, { label: '公告管理' }]}
    >
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-headline text-on-surface">公告管理</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            發布於前台的資安資訊;僅「已發布」狀態會對外顯示。
          </p>
        </div>
        <Link href="/admin/posts/new">
          <Button size="sm" leadingIcon={<Plus size={15} />}>新增公告</Button>
        </Link>
      </header>

      {posts.length === 0 ? (
        <Card>
          <EmptyState icon={<FileText size={28} />} title="尚無公告" description="點右上「新增公告」開始。" />
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <table className="w-full text-body-sm">
            <thead className="text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low">
              <tr>
                <th className="text-left px-5 py-3 font-medium">標題</th>
                <th className="text-left px-5 py-3 font-medium">分類</th>
                <th className="text-left px-5 py-3 font-medium">狀態</th>
                <th className="text-right px-5 py-3 font-medium">發布時間</th>
                <th className="text-right px-5 py-3 font-medium">編輯</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-t border-outline-variant/60 hover:bg-surface-container-low transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {p.important && <Chip tone="danger" size="sm">重要</Chip>}
                      {p.pinned && <Chip tone="neutral" size="sm">置頂</Chip>}
                      <span className="font-medium text-on-surface">{p.title}</span>
                    </div>
                    <span className="block text-caption font-mono text-on-surface-variant mt-0.5">/news/{p.slug}</span>
                  </td>
                  <td className="px-5 py-3">
                    <Chip tone="primary" size="sm">{POST_CATEGORY_LABELS[p.category as PostCategory] ?? p.category}</Chip>
                  </td>
                  <td className="px-5 py-3">
                    <Chip tone={STATUS_TONE[p.status as PostStatus]} size="sm" dot>
                      {STATUS_LABEL[p.status as PostStatus]}
                    </Chip>
                  </td>
                  <td className="px-5 py-3 text-right text-caption text-on-surface-variant tabular-nums">
                    {p.publishedAt ? new Date(p.publishedAt).toLocaleString('zh-TW') : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/posts/${p.id}`} className="text-primary-700 hover:underline">編輯</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
