import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

export default async function AuditMergeToolPage() {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin/tools/audit-merge');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard');
  const user = session.user;

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '稽核報告彙整工具' }]}
    >
      <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline text-on-surface">稽核報告彙整工具</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant max-w-2xl">
            實地稽核時彙整各委員的稽核發現:三構面編輯、共現統計、官方格式即時預覽與列印。
            資料保存在你瀏覽器本機(localStorage),不會上傳伺服器。
          </p>
        </div>
        <a href="/api/admin/tools/audit-merge" target="_blank" rel="noopener">
          <Button variant="tonal" size="sm">另開視窗(列印建議用)</Button>
        </a>
      </div>
      <div className="rounded-md border border-outline-variant overflow-hidden bg-white shadow-elev-1">
        <iframe
          src="/api/admin/tools/audit-merge"
          title="稽核報告彙整工具"
          className="w-full block"
          style={{ height: 'calc(100vh - 230px)', minHeight: 640 }}
        />
      </div>
    </AppShell>
  );
}
