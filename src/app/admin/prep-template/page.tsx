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
  // 年度歷史檢視的年度來源之一:已開立週期的年度(讓歷史年度即使無年度專屬項目也看得到當年清單)
  const cycleYears = (await prisma.auditCycle.findMany({ select: { year: true }, distinct: ['year'] })).map((c) => c.year);

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '資料準備清單' }]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-on-surface">資料準備標準清單</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">
          依年度檢視「套用標準清單」帶入的完整項目(分技術檢測 / 實地稽核 / 中心匯入三區):
          每個年度頁籤顯示該年度週期實際會帶入的清單=「通用」項目+該年度專屬項目(同名時年度項優先=逐年覆寫)。
          通用項目每年都帶入,修改會影響所有年度;各週期套用後仍可逐案調整。清單為空時,系統會帶入內建預設清單。
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
        cycleYears={cycleYears}
      />
    </AppShell>
  );
}
