import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/shell/AppShell';
import PrepTemplateManager from './PrepTemplateManager';

export const dynamic = 'force-dynamic';

export default async function PrepTemplatePage() {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin/prep-template');
  const user = session.user;
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const t = await prisma.prepTemplate.findFirst({ where: { name: '標準清單' } });
  const items = t
    ? await prisma.prepTemplateItem.findMany({ where: { templateId: t.id }, orderBy: { orderIndex: 'asc' } })
    : [];

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '資料準備清單' }]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-on-surface">資料準備標準清單</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">
          維護「套用標準清單」帶入的項目(分技術檢測 / 實地稽核 / 中心匯入三區),可依年度分類:
          「通用」項目每年都帶入;指定年度的項目只帶入該年度週期(同名時年度項優先=逐年覆寫)。
          各週期套用後仍可逐案調整。清單為空時,系統會帶入內建預設清單。
        </p>
      </header>
      <PrepTemplateManager
        initialItems={items.map((i) => ({
          id: i.id,
          title: i.title,
          description: i.description,
          category: i.category,
          required: i.required,
          year: i.year,
        }))}
      />
    </AppShell>
  );
}
