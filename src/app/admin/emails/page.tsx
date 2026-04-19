import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileText } from '@/components/icons';

const kindLabel: Record<string, { label: string; tone: 'primary' | 'sage' | 'neutral' | 'warning' }> = {
  invitation:        { label: '邀請',       tone: 'primary' },
  'cycle-notify':    { label: '週期通知',   tone: 'sage' },
  'password-reset':  { label: '重設密碼',   tone: 'warning' },
  other:             { label: '其他',       tone: 'neutral' },
};

export default async function EmailLogPage() {
  const session = await auth();
  const user = session!.user;

  const logs = await prisma.emailLog.findMany({
    orderBy: { sentAt: 'desc' },
    take: 200,
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理', href: '/admin/organizations' }, { label: 'Email 紀錄' }]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-on-surface">Email 紀錄</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          本系統目前在雛形階段，郵件以模擬方式寫入資料庫與 <code className="font-mono">uploads/emails/</code> 資料夾；之後切換到 SMTP 僅需替換 <code className="font-mono">src/lib/email.ts</code>。
        </p>
      </header>

      {logs.length === 0 ? (
        <Card>
          <EmptyState icon={<FileText size={28} />} title="尚無郵件紀錄" />
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <table className="w-full text-body-sm">
            <thead className="text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low">
              <tr>
                <th className="text-left px-5 py-3 font-medium">時間</th>
                <th className="text-left px-5 py-3 font-medium">類型</th>
                <th className="text-left px-5 py-3 font-medium">收件者</th>
                <th className="text-left px-5 py-3 font-medium">主旨</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const k = kindLabel[l.kind] ?? kindLabel.other;
                return (
                  <tr key={l.id} className="border-t border-outline-variant/60 align-top">
                    <td className="px-5 py-3 text-caption text-on-surface-variant tabular-nums whitespace-nowrap">
                      {new Date(l.sentAt).toLocaleString('zh-TW')}
                    </td>
                    <td className="px-5 py-3">
                      <Chip size="sm" tone={k.tone}>{k.label}</Chip>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium">{l.toName ?? '—'}</div>
                      <div className="text-caption font-mono text-on-surface-variant">{l.toEmail}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-on-surface">{l.subject}</div>
                      <details className="mt-1 text-caption text-on-surface-variant">
                        <summary className="cursor-pointer hover:text-primary-700">內文</summary>
                        <pre className="mt-2 p-3 bg-surface-container-low rounded-md whitespace-pre-wrap font-sans text-body-sm text-on-surface">{l.body}</pre>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
