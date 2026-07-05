import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { PageHeader } from '@/components/shell/PageHeader';
import { FilterBar, FilterInput } from '@/components/ui/FilterField';
import { EmailBodyButton } from './EmailBodyButton';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileText } from '@/components/icons';
import { FilterChipLink, FilterChipCount } from '@/components/ui/FilterChip';
import { TableScroll } from '@/components/ui/TableScroll';
import { Table, THead, Th, Tr, Td } from '@/components/ui/DataTable';
import { fmtROCDateTime } from '@/lib/date';
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

type DeliveryKey = 'sent' | 'failed' | 'simulated' | 'skipped' | 'dead-letter';

const STATUS_KEYS = ['sent', 'failed', 'simulated', 'skipped', 'dead-letter'] as const;

const deliveryMeta: Record<DeliveryKey, { label: string; tone: 'success' | 'neutral' | 'danger' | 'warning' }> = {
  sent:          { label: '已寄出',       tone: 'success' },
  failed:        { label: '寄送失敗',     tone: 'danger' },
  simulated:     { label: '模擬',         tone: 'neutral' },
  skipped:       { label: '已去重',       tone: 'warning' },
  'dead-letter': { label: '死信(待人工)', tone: 'danger' },
};

/** 以可查詢的 status 欄為準(死信補寄 timer 與寄信時皆同步寫入);未知值退回已寄出。 */
function statusOf(l: { status: string }): DeliveryKey {
  return (STATUS_KEYS as readonly string[]).includes(l.status) ? (l.status as DeliveryKey) : 'sent';
}

export default async function EmailLogPage({
  searchParams,
}: {
  searchParams: { kind?: string; status?: string; q?: string };
}) {
  const session = await auth();
  const user = session!.user;

  const kind = searchParams.kind && kindLabel[searchParams.kind] ? searchParams.kind : null;
  const status = (STATUS_KEYS as readonly string[]).includes(searchParams.status ?? '')
    ? (searchParams.status as DeliveryKey)
    : null;
  const q = (searchParams.q ?? '').trim();

  const where = {
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
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
    Promise.all(STATUS_KEYS.map((s) => prisma.emailLog.count({ where: { status: s } }))),
  ]);
  const [sentCount, failedCount, simulatedCount, skippedCount, deadCount] = totals;

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
      crumbs={[{ label: '管理' }, { label: 'Email' }]}
    >
      <PageHeader
        title="Email"
        subtitle={
          <>
            寄送追蹤信並查閱全部郵件紀錄。寄信經 <code className="font-mono">moecish@m365.ntu.edu.tw</code>(Graph);
            寄送失敗會自動補寄(每 10 分鐘、最多 3 次),仍失敗即列為「死信」,可在下方逐封人工重寄。
          </>
        }
      />

      <ComposeTracking orgs={orgs} />

      {/* 篩選:狀態 chips + 類型 chips + 關鍵字(統一 FilterBar 版位;批85) */}
      <FilterBar>
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
          {deadCount > 0 && (
            <FilterChipLink href={qs({ status: 'dead-letter' })} selected={status === 'dead-letter'}>
              死信 <FilterChipCount selected={status === 'dead-letter'}>{deadCount}</FilterChipCount>
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
          <FilterInput
            type="search"
            name="q"
            defaultValue={q}
            placeholder="搜尋收件人或主旨…"
            className="flex-1"
          />
        </form>
      </FilterBar>

      {logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText size={28} />}
            title={kind || status || q ? '沒有符合條件的紀錄' : '尚無郵件紀錄'}
          />
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <TableScroll maxHeight="70vh">
          <Table ledger density="compact">
            <THead sticky>
              <Th>時間</Th>
              <Th>類型</Th>
              <Th>狀態</Th>
              <Th>收件者</Th>
              <Th>主旨</Th>
              <Th numeric>操作</Th>
            </THead>
            <tbody>
              {logs.map((l) => {
                const k = kindLabel[l.kind] ?? kindLabel.other;
                const s = statusOf(l);
                const d = deliveryMeta[s];
                return (
                  <Tr key={l.id} hover={false} className="align-top">
                    <Td className="text-caption text-on-surface-variant tabular-nums whitespace-nowrap">
                      {fmtROCDateTime(l.sentAt)}
                    </Td>
                    <Td>
                      <Chip size="sm" tone={k.tone}>{k.label}</Chip>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Chip size="sm" tone={d.tone} dot>{d.label}</Chip>
                        {l.retryCount > 0 && (
                          <span className="text-caption text-on-surface-variant tabular-nums">已重試 {l.retryCount} 次</span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <div className="font-medium">{l.toName ?? '—'}</div>
                      <div className="text-caption font-mono text-on-surface-variant">{l.toEmail}</div>
                    </Td>
                    <Td>
                      <div className="text-on-surface">{l.subject}</div>
                      <EmailBodyButton
                        subject={l.subject}
                        body={l.body}
                        to={l.toName ? `${l.toName}（${l.toEmail}）` : l.toEmail}
                        sentAt={fmtROCDateTime(l.sentAt)}
                      />
                    </Td>
                    <Td className="text-right">
                      {(s === 'failed' || s === 'dead-letter') && <ResendButton logId={l.id} />}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          </TableScroll>
        </Card>
      )}
    </AppShell>
  );
}
