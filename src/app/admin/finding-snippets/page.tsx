import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import SnippetManager from './SnippetManager';

export const dynamic = 'force-dynamic';

/** 稽核發現片語庫(剪貼簿)管理:最高管理員維護常用發現片語,委員實地稽核時可一鍵插入。 */
export default async function FindingSnippetsPage() {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin/finding-snippets');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard');
  const user = session.user;

  const snippets = await prisma.findingSnippet.findMany({
    orderBy: [{ aspect: 'asc' }, { kind: 'asc' }, { orderIndex: 'asc' }, { createdAt: 'asc' }],
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理' }, { label: '發現片語庫' }]}
    >
      <header className="mb-9 pb-5 border-b border-rule flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-headline-lg text-ink-900 tracking-tight">稽核發現片語庫（剪貼簿）</h1>
          <p className="mt-2.5 text-body-sm text-ink-500 max-w-2xl leading-relaxed">
            維護委員實地稽核時常用的發現片語。可標註適用構面與類型（或設為通用）；委員於「實地稽核 → 稽核發現」表單按「剪貼簿」時，會依其當前構面/類型自動篩選並一鍵插入。
          </p>
        </div>
      </header>
      <SnippetManager
        initial={snippets.map((s) => ({ id: s.id, aspect: s.aspect, kind: s.kind, text: s.text }))}
      />
    </AppShell>
  );
}
