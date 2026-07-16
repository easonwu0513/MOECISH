import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/shell/AppShell';
import { MailTabs } from '@/components/admin/MailTabs';
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

  // 快速帶入的稽核場次(平台資料串接):近兩個年度的週期,選了自動填醫院+實地/技檢日期
  const nowYear = new Date().getFullYear();
  const cycles = await prisma.auditCycle.findMany({
    where: { year: { gte: nowYear - 1 } },
    include: { organization: { select: { name: true, shortName: true } } },
    orderBy: [{ year: 'desc' }, { onsiteDate: 'asc' }],
    take: 40,
  });
  // +08:00 儲存的日期還原為當地 yyyy-mm-dd(與 prep 頁 isoDate 同法)
  const iso = (d: Date | null) => (d ? new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10) : null);
  const roc = (d: Date | null) => {
    const s = iso(d);
    if (!s) return null;
    const [y, m, dd] = s.split('-');
    return `${parseInt(y, 10) - 1911}/${parseInt(m, 10)}/${parseInt(dd, 10)}`;
  };
  const cycleOptions = cycles.map((c) => ({
    id: c.id,
    label: `${c.year - 1911} 年度 · ${c.organization.shortName ?? c.organization.name}${c.onsiteDate ? ` · 實地 ${roc(c.onsiteDate)}` : ''}`,
    hospital: c.organization.name,
    date: iso(c.onsiteDate),
    tech: iso(c.techCheckDate),
  }));

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '信件管理' }, { label: '信件範本' }]}
      wide
    >
      {/* 「信件管理」單一模組(UAT):信件範本(手動外寄)與系統寄件紀錄(自動通知)以頁籤同居,側欄只留一格 */}
      <header className="mb-5 pb-5 border-b border-rule">
        <h1 className="text-headline-lg text-ink-900 tracking-tight">信件管理</h1>
        <p className="mt-2.5 text-body-sm text-ink-500 max-w-3xl leading-relaxed">
          手動信件與系統通知的單一入口：「信件範本」產生公文與通知底稿供複製外寄；「系統寄件紀錄」查閱平台自動寄送的通知與追蹤信。
        </p>
      </header>
      <MailTabs active="letters" />
      <p className="mb-6 -mt-1 text-body-sm text-ink-500 max-w-3xl leading-relaxed">
        選一封範本、填入變數（醫院、日期、表格等），即時預覽後
        <b className="text-ink-700">一鍵複製含格式的信件內容</b>，貼到您的郵件用戶端寄送。底稿可於「管理底稿」編輯、新增或刪除。
        本頁僅產生內容供外部寄送，不經平台寄信管線。
      </p>
      <LetterStudio
        cycleOptions={cycleOptions}
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
