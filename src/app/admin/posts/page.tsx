import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableScroll } from '@/components/ui/TableScroll';
import { Table, THead, Th, Tr, Td } from '@/components/ui/DataTable';
import { FileText, Plus } from '@/components/icons';
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
      <PageHeader
        title="公告管理"
        subtitle="發布於前台的資安資訊;僅「已發布」狀態會對外顯示。"
        actions={
          <Link href="/admin/posts/new">
            <Button size="sm" leadingIcon={<Plus size={15} />}>新增公告</Button>
          </Link>
        }
      />

      {posts.length === 0 ? (
        <Card>
          <EmptyState icon={<FileText size={28} />} title="尚無公告" description="點右上「新增公告」開始。" />
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <TableScroll>
          <Table>
            <THead>
              <Th>標題</Th>
              <Th>分類</Th>
              <Th>狀態</Th>
              <Th numeric>發布時間</Th>
              <Th numeric>編輯</Th>
            </THead>
            <tbody>
              {posts.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {p.important && <Chip tone="danger" size="sm">重要</Chip>}
                      {p.pinned && <Chip tone="neutral" size="sm">置頂</Chip>}
                      <span className="font-medium text-on-surface">{p.title}</span>
                    </div>
                    <span className="block text-caption font-mono text-on-surface-variant mt-0.5">/news/{p.slug}</span>
                  </Td>
                  <Td>
                    <Chip tone="primary" size="sm">{POST_CATEGORY_LABELS[p.category as PostCategory] ?? p.category}</Chip>
                  </Td>
                  <Td>
                    <Chip tone={STATUS_TONE[p.status as PostStatus]} size="sm" dot>
                      {STATUS_LABEL[p.status as PostStatus]}
                    </Chip>
                  </Td>
                  <Td numeric className="text-caption text-on-surface-variant">
                    {p.publishedAt ? fmtROCDateTime(p.publishedAt) : '—'}
                  </Td>
                  <Td className="text-right">
                    <Link href={`/admin/posts/${p.id}`} className="text-primary-700 hover:underline">編輯</Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          </TableScroll>
        </Card>
      )}
    </AppShell>
  );
}
