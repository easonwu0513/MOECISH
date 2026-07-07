'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useState, type MouseEvent } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { canAccess } from '@/lib/access-policy';
import { auditorCanViewChecklistContent, auditorCanScore, type Role } from '@/lib/types';
import { useNav } from './NavProgress';
import { navIcon } from './nav-map';
import { ChevronRight } from '../icons';

/**
 * 側欄「稽核週期」階層展開樹(UAT 批65):年度 → 醫院 → 工作區 → 資料準備分類,
 * 讓使用者直達目的地(免經 /cycles 卡片 → 週期頁 → 找功能的來回跳轉)。
 * - 資料:GET /api/nav/cycles(角色過濾與 /cycles 頁一致);sessionStorage 快取 60s 免每次導航重打。
 * - 子連結依 access-policy 純函式派生(與週期頁狀態卡同一組規則):未開放的工作區不列(而非鎖定列)。
 * - 展開狀態存 sessionStorage(跨頁導航 Sidebar 會重掛);當前路徑所屬週期自動展開。
 * - 首繪(SSR/hydration)一律不畫樹,mount 後才讀 storage/fetch,避免 hydration 不一致。
 */

type NavCycle = {
  id: string;
  year: number;
  status: string;
  orgName: string;
  /** 各資料準備分類是否有項目(空分類 PrepBoard 不渲染 section=錨點不存在,樹端不列避免死錨點) */
  prep?: { tech: boolean; onsite: boolean; center: boolean };
};

type WorkspaceLink = { label: string; href: string; children?: { label: string; href: string }[] };

/** 某週期在某角色下可直達的工作區連結(未開放者不列;規則對齊週期頁狀態卡的 href/locked)。 */
export function cycleWorkspaces(role: Role, c: NavCycle): WorkspaceLink[] {
  const base = `/cycles/${c.id}`;
  const out: WorkspaceLink[] = [];
  // 稽核前資料準備 / 檢核表:機關 DRAFT 未開放;委員資料齊備(READY)後可見(API 已排除委員的 DRAFT/CLOSED)
  const orgLocked = role === 'ORG_ADMIN' && c.status === 'DRAFT';
  const isReviewer = role === 'AUDITOR' || role === 'OBSERVER'; // 觀察員(批30)比照委員待遇(窗口另由頁面把關)
  const prepOpen = isReviewer ? auditorCanViewChecklistContent(c.status) : !orgLocked;
  if (prepOpen) {
    // 分類錨點只列「該週期實際有項目」的分類(API 回傳布林;舊快取無 prep 欄位時不列=安全退化)。
    // 檢核表歸屬「稽核前資料準備」(批26 裁定:準備文件之一,獨立填報但不再獨立分類);
    // 委員 → 審閱頁(檢視超集)、機關/中心 → 檢核表頁,可見時機與 prep 同閘(原兩閘條件本就相同)。
    const children = [
      ...(c.prep?.tech ? [{ label: '技術檢測', href: `${base}/prep#prep-tech` }] : []),
      ...(c.prep?.onsite ? [{ label: '實地稽核', href: `${base}/prep#prep-onsite` }] : []),
      // 中心匯入區機關不顯示(PrepBoard 同規則)
      ...(role !== 'ORG_ADMIN' && c.prep?.center ? [{ label: '中心匯入', href: `${base}/prep#prep-center` }] : []),
      { label: '資通安全檢核表', href: isReviewer ? `${base}/review` : `${base}/checklist` },
    ];
    out.push({
      label: '稽核前資料準備',
      href: `${base}/prep`,
      children,
    });
  }
  // 實地稽核評分與發現:委員於實地稽核(ONSITE)後;中心全程(檢視委員評分/發現);機關/觀察員不涉入
  if (role === 'AUDITOR' ? auditorCanScore(c.status) : role === 'SUPER_ADMIN') {
    out.push({ label: '實地稽核評分與發現', href: `${base}/audit` });
  }
  // 稽核發現撰寫練習(批30):觀察員專屬工作台(ONSITE 起;指導委員入口在週期頁指導卡,不佔側欄)
  if (canAccess('practice.access', role, c.status)) {
    out.push({ label: '稽核發現撰寫練習', href: `${base}/practice` });
  }
  // 缺失與矯正管考:角色×階段閘同週期頁(委員缺失發布後、機關矯正執行後、中心全程)
  if (canAccess('deficiencies.view', role, c.status)) {
    out.push({ label: '缺失與矯正管考', href: `${base}/deficiencies` });
  }
  return out;
}

// sessionStorage 鍵:資料快取(60s TTL,過期採 stale-while-revalidate)與展開狀態。
// ⚠️鍵必須綁「使用者+角色」:①同一分頁登出換帳號 sessionStorage 不會清,未綁 email 會把
// 前一帳號的醫院清單殘留給下一帳號;②角色就地變更(admin PATCH,JWT 每請求同步)後,
// 只綁 email 會讓降級者 60s 內仍看到舊角色範圍的清單(存在性洩漏)——皆為三鏡審查 confirmed。
const CACHE_TTL = 60_000;
const cacheKey = (userKey: string, role: string) => `moecish.nav.cycles:${userKey}:${role}`;
const expandKey = (userKey: string) => `moecish.nav.cycles.expanded:${userKey}`;

/** 讀快取:過期不丟棄(fresh=false 先渲染、背景 revalidate),樹不會整棵消失一個網路往返。 */
function readCache(userKey: string, role: string): { data: NavCycle[]; fresh: boolean } | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(userKey, role));
    if (!raw) return null;
    const { at, data } = JSON.parse(raw) as { at: number; data: NavCycle[] };
    return { data, fresh: Date.now() - at < CACHE_TTL };
  } catch {
    return null;
  }
}

function persistExpanded(userKey: string, next: Set<string>) {
  try {
    sessionStorage.setItem(expandKey(userKey), JSON.stringify([...next]));
  } catch { /* 私密模式等寫入失敗可忽略 */ }
}

// SSR 不跑 layout effect(React 會警告);client 用 useLayoutEffect 在 paint 前還原,消除導航塌陷幀
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function CycleNavTree({ role, userKey, onClose }: { role: Role; userKey: string; onClose?: () => void }) {
  const pathname = usePathname();
  const nav = useNav();
  // 首繪一律 null/空集合(SSR 與 client 首繪一致);mount 後讀 storage → fetch
  const [cycles, setCycles] = useState<NavCycle[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // paint 前同步還原展開狀態與快取(useLayoutEffect):跨頁導航 Sidebar 重掛時樹不塌陷一幀。
  // SSR/hydration 首繪仍為空(effect 不在 server 跑),與伺服器 HTML 一致。
  useIsomorphicLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(expandKey(userKey));
      if (raw) setExpanded(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
    const cached = readCache(userKey, role);
    if (cached) setCycles(cached.data); // 過期也先渲染舊資料(stale-while-revalidate),背景更新
    if (cached?.fresh) return;
    let cancelled = false;
    fetch('/api/nav/cycles')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { cycles: NavCycle[] } | null) => {
        if (cancelled || !j) return;
        setCycles(j.cycles);
        try {
          sessionStorage.setItem(cacheKey(userKey, role), JSON.stringify({ at: Date.now(), data: j.cycles }));
        } catch { /* ignore */ }
      })
      .catch(() => { /* 失敗靜默:有舊資料顯示舊資料,否則樹不顯示,主連結照常可用 */ });
    return () => { cancelled = true; };
  }, [userKey, role]);

  // 目前路徑所屬週期:自動展開其年度與醫院鏈(聯集,不覆蓋使用者其他展開狀態;不寫入 storage=僅本頁面暫時)
  const currentCycleId = useMemo(() => {
    const m = pathname.match(/^\/cycles\/([^/]+)/);
    return m ? m[1] : null;
  }, [pathname]);
  useEffect(() => {
    if (!currentCycleId || !cycles) return;
    const cur = cycles.find((c) => c.id === currentCycleId);
    if (!cur) return;
    setExpanded((prev) => {
      if (prev.has('root') && prev.has(`y:${cur.year}`) && prev.has(`c:${cur.id}`)) return prev;
      const next = new Set(prev);
      next.add('root');
      next.add(`y:${cur.year}`);
      next.delete(`closed:y:${cur.year}`);
      next.add(`c:${cur.id}`);
      return next;
    });
  }, [currentCycleId, cycles]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistExpanded(userKey, next);
      return next;
    });
  }

  // 年度列:最新年度預設展開;手動收合記「closed:」標記,預設展開不再蓋回
  function toggleYear(yKey: string, isOpen: boolean) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isOpen) {
        next.delete(yKey);
        next.add(`closed:${yKey}`);
      } else {
        next.add(yKey);
        next.delete(`closed:${yKey}`);
      }
      persistExpanded(userKey, next);
      return next;
    });
  }

  function go(e: MouseEvent, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    nav.navigate(href);
    onClose?.();
  }

  // 年度分組(遞減)
  const years = useMemo(() => {
    if (!cycles) return [];
    const map = new Map<number, NavCycle[]>();
    for (const c of cycles) {
      const list = map.get(c.year) ?? [];
      list.push(c);
      map.set(c.year, list);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [cycles]);

  const rootOpen = expanded.has('root');
  const rootActive = pathname === '/cycles' || pathname.startsWith('/cycles/');
  const hasTree = (cycles?.length ?? 0) > 0;

  // 樹列共用樣式:縮排以 padding-left 分級;active 膠囊底(與主選單一致)
  const rowCls = (active: boolean, extra?: string) =>
    cn(
      'flex items-center gap-2 min-h-10 pr-3 text-label transition-colors duration-200 ease-standard focus-ring rounded-full',
      active
        ? 'bg-focus-wash text-primary-700 font-medium'
        : 'text-ink-500 hover:bg-paper-sunk hover:text-ink-900',
      extra,
    );

  const chevron = (open: boolean) => (
    <ChevronRight size={14} className={cn('shrink-0 transition-transform duration-200', open && 'rotate-90')} />
  );

  // 展開/收合鈕:獨立於連結之外(互動元素不可巢狀)
  const toggleBtn = (key: string, label: string, onToggle?: () => void) => (
    <button
      type="button"
      aria-label={`${expanded.has(key) ? '收合' : '展開'}${label}`}
      aria-expanded={expanded.has(key)}
      onClick={onToggle ?? (() => toggle(key))}
      className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-ink-500 hover:bg-paper-sunk hover:text-ink-900 focus-ring"
    >
      {chevron(expanded.has(key))}
    </button>
  );

  const linkRow = (href: string, label: string, opts?: { indent?: string; dim?: boolean }) => {
    // 錨點連結(#prep-*)不標 active(同頁多列都指向 /prep,只有主列標)
    const active = !href.includes('#') && pathname === href;
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        onClick={(e) => {
          // hash 錨點不攔截:交給 Link/瀏覽器原生處理(同頁 hash 用 router.push 有不捲動的邊緣案例)
          if (href.includes('#')) { onClose?.(); return; }
          go(e, href);
        }}
        className={rowCls(active, cn('flex-1 min-w-0', opts?.indent, opts?.dim && 'text-ink-500'))}
      >
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  return (
    <li>
      {/* 主列:「稽核週期」連結 + 展開鈕(有週期資料才顯示鈕) */}
      <div className="flex items-center gap-1">
        <Link
          href="/cycles"
          aria-current={rootActive ? 'page' : undefined}
          onClick={(e) => go(e, '/cycles')}
          className={cn(
            'group relative flex flex-1 min-w-0 items-center gap-3 h-14 px-4 text-label-lg transition-all duration-200 ease-standard focus-ring rounded-full',
            rootActive
              ? 'bg-focus-wash text-primary-700 font-medium'
              : 'text-ink-500 hover:bg-paper-sunk hover:text-ink-900',
          )}
        >
          <span className={cn('transition-colors', rootActive ? 'text-primary-700' : 'text-ink-500 group-hover:text-ink-900')}>
            {navIcon('cycles', 20)}
          </span>
          <span>稽核週期</span>
        </Link>
        {hasTree && toggleBtn('root', '稽核週期')}
      </div>

      {/* 階層樹:年度 → 醫院(週期首頁)→ 工作區 → 資料準備分類 */}
      {hasTree && rootOpen && (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {years.map(([year, list], yi) => {
            const yKey = `y:${year}`;
            const yOpen = expanded.has(yKey) || (yi === 0 && !expanded.has(`closed:${yKey}`));
            return (
              <li key={year}>
                <button
                  type="button"
                  aria-expanded={yOpen}
                  onClick={() => toggleYear(yKey, yOpen)}
                  className={rowCls(false, 'w-full text-left pl-6')}
                >
                  {chevron(yOpen)}
                  <span className="tabular-nums">{year - 1911} 年度</span>
                  <span className="text-label-sm text-ink-500 tabular-nums">{list.length}</span>
                </button>
                {yOpen && (
                  <ul className="flex flex-col gap-0.5">
                    {list.map((c) => {
                      const cKey = `c:${c.id}`;
                      const cOpen = expanded.has(cKey);
                      const cycleActive = pathname === `/cycles/${c.id}`;
                      const ws = cycleWorkspaces(role, c);
                      const closed = c.status === 'CLOSED';
                      return (
                        <li key={c.id}>
                          <div className="flex items-center gap-1">
                            <Link
                              href={`/cycles/${c.id}`}
                              aria-current={cycleActive ? 'page' : undefined}
                              onClick={(e) => go(e, `/cycles/${c.id}`)}
                              className={rowCls(cycleActive, cn('flex-1 min-w-0 pl-9', closed && 'text-ink-500'))}
                            >
                              <span className="truncate">{c.orgName}</span>
                              {closed && <span className="shrink-0 text-label-sm text-ink-500">結案</span>}
                            </Link>
                            {ws.length > 0 && toggleBtn(cKey, c.orgName)}
                          </div>
                          {cOpen && ws.length > 0 && (
                            <ul className="flex flex-col gap-0.5">
                              {ws.map((w) => {
                                const pKey = `p:${c.id}:${w.label}`;
                                const pOpen = expanded.has(pKey);
                                return (
                                  <li key={w.href}>
                                    {w.children ? (
                                      <>
                                        <div className="flex items-center gap-1">
                                          {linkRow(w.href, w.label, { indent: 'pl-12' })}
                                          {toggleBtn(pKey, w.label)}
                                        </div>
                                        {pOpen && (
                                          <ul className="flex flex-col gap-0.5">
                                            {w.children.map((sub) => (
                                              <li key={sub.href}>{linkRow(sub.href, sub.label, { indent: 'pl-16', dim: true })}</li>
                                            ))}
                                          </ul>
                                        )}
                                      </>
                                    ) : (
                                      linkRow(w.href, w.label, { indent: 'pl-12' })
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
