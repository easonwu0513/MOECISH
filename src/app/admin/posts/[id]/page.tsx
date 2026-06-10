import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import PostEditor from '../PostEditor';

export default async function EditPostPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const user = session!.user;

  const post = await prisma.post.findUnique({ where: { id: params.id } });
  if (!post) notFound();

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[
        { label: '管理', href: '/admin/organizations' },
        { label: '公告管理', href: '/admin/posts' },
        { label: post.title },
      ]}
    >
      <PostEditor
        post={{
          id: post.id,
          slug: post.slug,
          title: post.title,
          category: post.category,
          contentMd: post.contentMd,
          important: post.important,
          pinned: post.pinned,
          status: post.status,
        }}
      />
    </AppShell>
  );
}
