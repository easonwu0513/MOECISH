import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileText } from '@/components/icons';
import { FilterChipLink, FilterChipCount } from '@/components/ui/FilterChip';
import { TableScroll } from '@/components/ui/TableScroll';
import ComposeTracking from './ComposeTracking';
import ResendButton from './ResendButton';

const kindLabel: Record<string, { label: string; tone: 'primary' | 'sage' | 'neutral' | 'warning' | 'danger' }> = {
  invitation:            { label: '邀請',         tone: 'primary' },
  'cycle-notify':        { label: '週期通知',     tone: 'sage' },
  tracking:              { label: '追蹤信',       tone: 'warning' },
  'password-reset':      { label: '重設密碼',     tone: 'warning' },
  'review-request':      { label: '送審通知',     tone: 'primary' },
  'action-returned':     { label: '退回補正',     tone: 'warning' },
  'all-passed':          { label: '全數通過',     tone: 'sage' },
  'checklist-submitted': { label: '檢核表送出',   tone: 'primary' },
  'checklist-reopened':  { label: '檢核表退回',   tone: 'warning' },
  'health-alert':        { label: '系統警報',     tone: 'danger' },
  other:                 { label: '其他',         tone: 'neutral' },
};

type DeliveryKey = 'sent' | 'failed' | 'simulated' | 'skipped';

const deliveryMeta: Record<DeliveryKey, { label: string; tone: 'success' | 'neutral' | 'danger' | 'warning' }> = {
  sent:      { label: '已寄出',   tone: 'success' },
  failed:    { label: '寄送失敗', tone: 'danger' },
  simulated: { label: '模擬',     tone: 'neutral' },
  skipped:   { label: '已去重',   tone: 'warning' },
};

function deliveryOf(context: string | null): DeliveryKey {
  try {
    const c = context ? JSON.parse(context) : {};
    if (c.delivery === 'sent' || c.delivery === 'failed' || c.delivery === 'skipped') return c.delivery;
  } catch {}
  return 'simulated';
}

export default async function EmailLogPage({
  searchParams,
}: {
  searchParams: { kind?: string; status?: string; q?: string };
}) {
  const session = await auth();
  const user = session!.user;

  const kind = searchParams.kind && kindLabel[searchParams.kind] ? searchParams.kind : null;
  const status = (['sent', 'failed', 'simulated', 'skipped'] as const).includes(
    searchParams.status as DeliveryKey,
  )
    ? (searchParams.status as DeliveryKey)
    : null;
  const q = (searchParams.q ?? '').trim();

  const where = {
    ...(kind ? { kind } : {}),
    ...(status ? { context: { contains: `"delivery":"${status}"` } } : {}),
    ...(q
      ? {
          OR: [
            { toEmail: { contains: q } },
            { toName: { contains: q } },
            { subject: { contains: q } },
          ],
        }
      : {}),
  };

  const [logs, orgs, totals] = await Promise.all([
    prisma.emailLog.findMany({ where, orderBy: { sentAt: 'desc' }, take: 200 }),
    prisma.organization.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    Promise.all(
      (['sent', 'failed', 'simulated', 'skipped'] as const).map((s) =>
        prisma.emailLog.count({ where: { context: { contains: `"delivery":"${s}"` } } }),
      ),
    ),
  ]);
  const [sentCount, failedCount, simulatedCount, skippedCount] = totals;

  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { kind, status, q: q || null, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/emails${s ? `?${s}` : ''}`;
  };

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理', href: '/admin/organizations' }, { label: 'Email' }]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-on-surface">Email</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          寄送追蹤信並查閱全部郵件紀錄。寄信經 <code className="font-mono">moecish@m365.ntu.edu.tw</code>(Graph);
          失敗的信可在下方逐封重寄。
        </p>
      </header>

      <ComposeTracking orgs={orgs} />

      {/* 篩選:狀態 chips + 類型 chips + 關鍵字 */}
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChipLink href={qs({ status: null })} selected={!status}>
            全部狀態
          </FilterChipLink>
          <FilterChipLink href={qs({ status: 'sent' })} selected={status === 'sent'}>
            已寄出 <FilterChipCount selected={status === 'sent'}>{sentCount}</FilterChipCount>
          </FilterChipLink>
          <FilterChipLink href={qs({ status: 'failed' })} selected={status === 'failed'}>
            寄送失敗 <FilterChipCount selected={status === 'failed'}>{failedCount}</FilterChipCount>
          </FilterChipLink>
          <FilterChipLink href={qs({ status: 'simulated' })} selected={status === 'simulated'}>
            模擬 <FilterChipCount selected={status === 'simulated'}>{simulatedCount}</FilterChipCount>
          </FilterChipLink>
          {skippedCount > 0 && (
            <FilterChipLink href={qs({ status: 'skipped' })} selected={status === 'skipped'}>
              已去重 <FilterChipCount selected={status === 'skipped'}>{skippedCount}</FilterChipCount>
            </FilterChipLink>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChipLink href={qs({ kind: null })} selected={!kind}>
            全部類型
          </FilterChipLink>
          {Object.entries(kindLabel)
            .filter(([k]) => k !== 'other')
            .map(([k, v]) => (
              <FilterChipLink key={k} href={qs({ kind: k })} selected={kind === k}>
                {v.label}
              </FilterChipLink>
            ))}
        </div>
        <form action="/admin/emails" method="get" className="flex items-center gap-2 max-w-sm">
          {kind && <input type="hidden" name="kind" value={kind} />}
          {status && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="搜尋收件人或主旨…"
            className="h-9 flex-1 rounded-md border border-outline-variant bg-surface px-3 text-body-sm focus-ring"
          />
        </form>
      </div>

      {logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText size={28} />}
            title={kind || status || q ? '沒有符合條件的紀錄' : '尚無郵件紀錄'}
          />
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <TableScroll>
          <table className="w-full text-body-sm">
            <thead className="text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low">
              <tr>
                <th className="text-left px-5 py-3 font-medium">時間</th>
                <th className="text-left px-5 py-3 font-medium">類型</th>
                <th className="text-left px-5 py-3 font-medium">狀態</th>
                <th className="text-left px-5 py-3 font-medium">收件者</th>
                <th className="text-left px-5 py-3 font-medium">主旨</th>
                <th className="text-right px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const k = kindLabel[l.kind] ?? kindLabel.other;
                const d = deliveryMeta[deliveryOf(l.context)];
                return (
                  <tr key={l.id} className="border-t border-outline-variant/60 align-top">
                    <td className="px-5 py-3 text-caption text-on-surface-variant tabular-nums whitespace-nowrap">
                      {new Date(l.sentAt).toLocaleString('zh-TW')}
                    </td>
                    <td className="px-5 py-3">
                      <Chip size="sm" tone={k.tone}>{k.label}</Chip>
                    </td>
                    <td className="px-5 py-3">
                      <Chip size="sm" tone={d.tone} dot>{d.label}</Chip>
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
                    <td className="px-5 py-3 text-right">
                      {deliveryOf(l.context) === 'failed' && <ResendButton logId={l.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </TableScroll>
        </Card>
      )}
    </AppShell>
  );
}
