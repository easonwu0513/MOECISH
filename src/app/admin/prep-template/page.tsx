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
    ? await prisma.prepTemplateItem.findMany({
        where: { templateId: t.id },
        orderBy: { orderIndex: 'asc' },
        include: { files: { orderBy: { uploadedAt: 'asc' }, select: { id: true, originalName: true, sizeBytes: true } } },
      })
    : [];
  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '資料準備清單' }]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-on-surface">資料準備標準清單</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">
          本頁為「本年度」的標準清單(分技術檢測 / 實地稽核 / 中心匯入三區):各週期「套用標準清單」會帶入本年度項目,
          套用後仍可逐案調整;清單為空時帶入系統內建預設。每年清單通常先以「歷年清單」代入上一年度、再小幅修正;
          修改本年度不會動到歷年留存紀錄(近五年清單與文件範本於「歷年清單」唯讀保存)。
          各項目可上傳「文件範本」(僅此處接受 Word/Excel 等可編輯格式)供機關於資料準備頁下載依式填寫。
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
          files: i.files,
        }))}
      />
    </AppShell>
  );
}
