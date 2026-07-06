import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/shell/AppShell';
import LetterStudio from './LetterStudio';

export const dynamic = 'force-dynamic';

export default async function LetterTemplatesPage() {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin/letter-templates');
  const user = session.user;
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const templates = await prisma.letterTemplate.findMany({
    orderBy: [{ workflowOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '信件範本' }]}
      wide
    >
      <header className="mb-8 pb-5 border-b border-rule">
        <h1 className="text-headline-lg text-ink-900 tracking-tight">信件範本</h1>
        <p className="mt-2.5 text-body-sm text-ink-500 max-w-3xl leading-relaxed">
          稽核作業各階段的公文與通知底稿。選一封範本、填入變數（醫院、日期、表格等），即時預覽後
          <b className="text-ink-700">一鍵複製含格式的信件內容</b>，貼到您的郵件用戶端寄送。底稿可於「管理底稿」編輯、新增或刪除。
          本頁僅產生內容供外部寄送，不經平台寄信管線。
        </p>
      </header>
      <LetterStudio
        initialTemplates={templates.map((t) => ({
          id: t.id,
          templateKey: t.templateKey,
          category: t.category,
          workflowOrder: t.workflowOrder,
          subGroup: t.subGroup,
          title: t.title,
          attachment: t.attachment,
          audience: t.audience,
          subject: t.subject,
          content: t.content,
          enabled: t.enabled,
        }))}
      />
    </AppShell>
  );
}
