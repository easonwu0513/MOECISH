import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { MailTabs } from '@/components/admin/MailTabs';
import { FilterBar, FilterInput } from '@/components/ui/FilterField';
import { EmailBodyButton } from './EmailBodyButton';
import { Chip } from '@/components/ui/Chip';
import { FilterChipLink, FilterChipCount } from '@/components/ui/FilterChip';
import { TableScroll } from '@/components/ui/TableScroll';
import { fmtROCDateTime } from '@/lib/date';
import ComposeTracking from './ComposeTracking';
import ResendButton from './ResendButton';

const kindLabel: Record<string, { label: string; tone: 'primary' | 'sage' | 'neutral' | 'warning' | 'danger' }> = {
  invitation:            { label: '邀請',         tone: 'primary' },
  'cycle-notify':        { label: '週期通知',     tone: 'sage' },
  tracking:              { label: '追蹤信',       tone: 'warning' },
  'track-remind':        { label: '催辦追蹤',     tone: 'warning' },
  'password-reset':      { label: '重設密碼',     tone: 'warning' },
  'review-request':      { label: '送審通知',     tone: 'primary' },
  'action-returned':     { label: '退回補正',     tone: 'warning' },
  'all-passed':          { label: '全數通過',     tone: 'sage' },
  'checklist-submitted': { label: '檢核表送出',   tone: 'primary' },
  'checklist-reopened':  { label: '檢核表退回',   tone: 'warning' },
  'review-window-request': { label: '委員求設時段', tone: 'warning' },
  // 缺失持續列管(批71/72)
  'tracked-created':     { label: '轉入列管',     tone: 'warning' },
  'tracked-report':      { label: '列管回報',     tone: 'primary' },
  'tracked-reviewed':    { label: '列管審核',     tone: 'sage' },
  'tracked-due':         { label: '列管催辦',     tone: 'warning' },
  'health-alert':        { label: '系統警報',     tone: 'danger' },
  'letter-manual':       { label: '手動信件',     tone: 'primary' },
  other:                 { label: '其他',         tone: 'neutral' },
};

type DeliveryKey = 'sent' | 'failed' | 'simulated' | 'skipped' | 'dead-letter' | 'manual';

const STATUS_KEYS = ['sent', 'failed', 'simulated', 'skipped', 'dead-letter', 'manual'] as const;

const deliveryMeta: Record<DeliveryKey, { label: string; tone: 'success' | 'neutral' | 'danger' | 'warning' }> = {
  sent:          { label: '已寄出',       tone: 'success' },
  failed:        { label: '寄送失敗',     tone: 'danger' },
  simulated:     { label: '模擬',         tone: 'neutral' },
  skipped:       { label: '已去重',       tone: 'warning' },
  'dead-letter': { label: '死信（待人工）', tone: 'danger' },
  manual:        { label: '手動外寄',     tone: 'neutral' }, // 信件範本留存:承辦於外部寄出,平台僅留檔
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
    // 狀態 chip 計數併入當前類型/關鍵字篩選,與下方清單一致(批35 稽核:原忽略篩選顯全站總數,誤導)
    Promise.all(STATUS_KEYS.map((s) => prisma.emailLog.count({ where: { ...where, status: s } }))),
  ]);
  const [sentCount, failedCount, simulatedCount, skippedCount, deadCount, manualCount] = totals;

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
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '信件管理' }, { label: '系統寄件紀錄' }]}
    >
      {/* 「信件管理」單一模組(UAT):與信件範本以頁籤同居;本頁=系統自動寄送的紀錄與追蹤信 */}
      <header className="mb-5 pb-5 border-b border-rule flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-headline-lg text-ink-900 tracking-tight">信件管理</h1>
          <p className="mt-2.5 text-body-sm text-ink-500 max-w-2xl leading-relaxed">
            手動信件與系統通知的單一入口：「信件範本」產生公文與通知底稿供複製外寄；「系統寄件紀錄」查閱平台自動寄送的通知與追蹤信。
          </p>
        </div>
      </header>
      <MailTabs active="log" />
      <p className="mb-6 -mt-1 text-body-sm text-ink-500 max-w-2xl leading-relaxed">
        寄送追蹤信並查閱全部郵件紀錄。寄信經 <code className="font-mono">moecish@m365.ntu.edu.tw</code>（Graph）；
        寄送失敗會自動補寄（每 10 分鐘、最多 3 次），仍失敗即列為「死信」，可在下方逐封人工重寄。
      </p>

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
          {manualCount > 0 && (
            <FilterChipLink href={qs({ status: 'manual' })} selected={status === 'manual'}>
              手動外寄 <FilterChipCount selected={status === 'manual'}>{manualCount}</FilterChipCount>
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
        <div className="rounded-md border border-rule bg-card px-6 py-14 text-center">
          <p className="text-title text-ink-700">
            {kind || status || q ? '沒有符合條件的紀錄' : '尚無郵件紀錄'}
          </p>
          <p className="mt-1.5 text-body-sm text-ink-500">
            {kind || status || q ? '試試調整篩選條件或搜尋關鍵字。' : '寄出追蹤信或系統通知後，紀錄會列於此。'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-rule bg-card">
          <TableScroll maxHeight="70vh">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-rule-strong bg-paper-sunk text-left text-caption text-ink-500 [&_th]:sticky [&_th]:top-0 [&_th]:bg-paper-sunk">
                  <th className="px-4 py-2.5 font-medium">時間</th>
                  <th className="px-4 py-2.5 font-medium">類型</th>
                  <th className="px-4 py-2.5 font-medium">狀態</th>
                  <th className="px-4 py-2.5 font-medium">收件者</th>
                  <th className="px-4 py-2.5 font-medium">主旨</th>
                  <th className="px-4 py-2.5 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const k = kindLabel[l.kind] ?? kindLabel.other;
                  const s = statusOf(l);
                  const d = deliveryMeta[s];
                  return (
                    <tr key={l.id} className="border-b border-rule last:border-b-0 hover:bg-paper-sunk transition-colors align-top">
                      <td className="px-4 py-3 text-caption text-ink-500 tabular-nums whitespace-nowrap">
                        {fmtROCDateTime(l.sentAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Chip size="sm" tone={k.tone}>{k.label}</Chip>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Chip size="sm" tone={d.tone} dot>{d.label}</Chip>
                          {l.retryCount > 0 && (
                            <span className="text-caption text-ink-500 tabular-nums">已重試 {l.retryCount} 次</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink-900">{l.toName ?? <span className="text-ink-500">—</span>}</div>
                        <div className="text-caption font-mono text-ink-500">{l.toEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-ink-900">{l.subject}</div>
                        <EmailBodyButton
                          subject={l.subject}
                          body={l.body}
                          to={l.toName ? `${l.toName}（${l.toEmail}）` : l.toEmail}
                          sentAt={fmtROCDateTime(l.sentAt)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(s === 'failed' || s === 'dead-letter') && <ResendButton logId={l.id} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}
    </AppShell>
  );
}
