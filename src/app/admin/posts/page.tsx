import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Plus } from '@/components/icons';
import { FilterChipLink, FilterChipCount } from '@/components/ui/FilterChip';
import { POST_CATEGORIES, POST_CATEGORY_LABELS, type PostCategory } from '@/lib/types';
import { postLifecycle, POST_LIFECYCLE_LABELS, POST_LIFECYCLE_TONES, type PostLifecycle } from '@/lib/posts';
import { fmtROCDateTime } from '@/lib/date';

export const dynamic = 'force-dynamic';

const LIFECYCLE_ORDER: PostLifecycle[] = ['draft', 'scheduled', 'live', 'off'];

const FLAGS = ['pinned', 'important'] as const;
type PostFlag = (typeof FLAGS)[number];
const FLAG_LABELS: Record<PostFlag, string> = { pinned: '置頂', important: '重要' };

export default async function AdminPostsPage({ searchParams }: { searchParams: { cat?: string; state?: string; flag?: string } }) {
  const session = await auth();
  const user = session!.user;

  const all = await prisma.post.findMany({
    // P2:前台(/news、首頁)以 publishedAt 排序;後台原用 updatedAt,改個舊公告就跳到最上面 → 兩端統一
    orderBy: [{ pinned: 'desc' }, { publishedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
  });

  const now = new Date();
  const withState = all.map((p) => ({ p, state: postLifecycle(p, now) }));

  // 篩選:分類(cat)+ 生命週期四態(state)+ 標記(flag:置頂/重要);其一為 all/未指定=不篩。
  const cat = POST_CATEGORIES.includes(searchParams.cat as PostCategory) ? (searchParams.cat as PostCategory) : null;
  const state = LIFECYCLE_ORDER.includes(searchParams.state as PostLifecycle) ? (searchParams.state as PostLifecycle) : null;
  const flag = FLAGS.includes(searchParams.flag as PostFlag) ? (searchParams.flag as PostFlag) : null;
  const shown = withState.filter(
    ({ p, state: st }) => (!cat || p.category === cat) && (!state || st === state) && (!flag || p[flag]),
  );

  const catCount = (c: PostCategory) => withState.filter(({ p }) => p.category === c).length;
  const stateCount = (s: PostLifecycle) => withState.filter(({ state: st }) => st === s).length;
  const flagCount = (f: PostFlag) => withState.filter(({ p }) => p[f]).length;
  const qs = (next: { cat?: string | null; state?: string | null; flag?: string | null }) => {
    const c = next.cat === undefined ? cat : next.cat;
    const s = next.state === undefined ? state : next.state;
    const f = next.flag === undefined ? flag : next.flag;
    const params = new URLSearchParams();
    if (c) params.set('cat', c);
    if (s) params.set('state', s);
    if (f) params.set('flag', f);
    const q = params.toString();
    return q ? `/admin/posts?${q}` : '/admin/posts';
  };

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理' }, { label: '公告管理' }]}
    >
      {/* ── 文件大標(黑體)+ 動作;公文式底規線 ── */}
      <header className="mb-6 pb-5 border-b border-rule flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-headline-lg text-ink-900 tracking-tight">公告管理</h1>
          <p className="mt-2.5 text-body-sm text-ink-500 max-w-2xl leading-relaxed">
            發布於前台的資安資訊；僅「發布中」狀態會對外顯示（排程未上架=待發布、過下架時間=已下架）。
          </p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <Link href="/admin/posts/new">
            <Button size="sm" leadingIcon={<Plus size={15} />}>新增公告</Button>
          </Link>
        </div>
      </header>

      {/* 批33 圖2:標籤列——分類 + 生命週期四態,各為一列可篩。 */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span className="text-caption text-ink-500 mr-0.5 w-10 shrink-0">分類</span>
        <FilterChipLink href={qs({ cat: null })} selected={!cat}>
          全部 <FilterChipCount selected={!cat}>{withState.length}</FilterChipCount>
        </FilterChipLink>
        {POST_CATEGORIES.map((c) => (
          <FilterChipLink key={c} href={qs({ cat: c })} selected={cat === c}>
            {POST_CATEGORY_LABELS[c]} <FilterChipCount selected={cat === c}>{catCount(c)}</FilterChipCount>
          </FilterChipLink>
        ))}
      </div>
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span className="text-caption text-ink-500 mr-0.5 w-10 shrink-0">狀態</span>
        <FilterChipLink href={qs({ state: null })} selected={!state}>
          全部
        </FilterChipLink>
        {LIFECYCLE_ORDER.map((s) => (
          <FilterChipLink key={s} href={qs({ state: s })} selected={state === s}>
            {POST_LIFECYCLE_LABELS[s]} <FilterChipCount selected={state === s}>{stateCount(s)}</FilterChipCount>
          </FilterChipLink>
        ))}
      </div>
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <span className="text-caption text-ink-500 mr-0.5 w-10 shrink-0">標記</span>
        <FilterChipLink href={qs({ flag: null })} selected={!flag}>
          全部
        </FilterChipLink>
        {FLAGS.map((f) => (
          <FilterChipLink key={f} href={qs({ flag: f })} selected={flag === f}>
            {FLAG_LABELS[f]} <FilterChipCount selected={flag === f}>{flagCount(f)}</FilterChipCount>
          </FilterChipLink>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-md border border-rule bg-card px-6 py-14 text-center">
          <p className="text-title text-ink-700">{all.length === 0 ? '尚無公告' : '沒有符合篩選條件的公告'}</p>
          <p className="mt-1.5 text-body-sm text-ink-500">{all.length === 0 ? '點右上「新增公告」開始。' : '調整上方分類或狀態篩選。'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-rule bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-rule-strong bg-paper-sunk text-left text-caption text-ink-500">
                  <th className="px-4 py-2.5 font-medium">標題</th>
                  <th className="px-4 py-2.5 font-medium">分類</th>
                  <th className="px-4 py-2.5 font-medium">狀態</th>
                  <th className="px-4 py-2.5 font-medium text-right">上架 / 下架時間</th>
                  <th className="px-4 py-2.5 font-medium text-right">編輯</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ p, state: st }) => (
                  <tr key={p.id} className="border-b border-rule last:border-b-0 hover:bg-paper-sunk transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {p.important && <Chip tone="danger" size="sm">重要</Chip>}
                        {p.pinned && <Chip tone="neutral" size="sm">置頂</Chip>}
                        <span className="font-medium text-ink-900">{p.title}</span>
                      </div>
                      <span className="block text-caption font-mono text-ink-500 mt-0.5">/news/{p.slug}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone="primary" size="sm">{POST_CATEGORY_LABELS[p.category as PostCategory] ?? p.category}</Chip>
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone={POST_LIFECYCLE_TONES[st]} size="sm" dot>
                        {POST_LIFECYCLE_LABELS[st]}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-caption text-ink-500">
                      <span>{p.publishedAt ? fmtROCDateTime(p.publishedAt) : '—'}</span>
                      {p.unpublishAt && (
                        <span className="block text-ink-400">下架 {fmtROCDateTime(p.unpublishAt)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/posts/${p.id}`} className="text-primary-700 hover:underline">編輯</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
