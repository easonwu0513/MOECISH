import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import PostEditor from '../PostEditor';

export default async function NewPostPage() {
  const session = await auth();
  const user = session!.user;

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[
        { label: '管理', href: '/admin/organizations' },
        { label: '公告管理', href: '/admin/posts' },
        { label: '新增' },
      ]}
    >
      <PostEditor post={null} />
    </AppShell>
  );
}
