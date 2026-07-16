import type { Role, PostCategory } from './types';
import { ROLE_TONE } from './types';

/**
 * 語意色調(Tone)單一真實來源 —— UIUX 稽核 #2 根治「型別層平行漂移」。
 *
 * 背景:過去 Chip / ProgressBar / Segmented / StatTopBar / StackedBar / Timeline / Alert / EmptyState
 * 各自宣告一份 `type Tone` 並手抄 Record<Tone, class>,集合彼此不一致(有的 6 色有的 5 色、
 * 同 tone 跨元件對到不同色階:實心填色 warning=500 vs success=600),導致:①新增/調色要改 6+ 檔且必漏;
 * ②同一 tone 在不同元件深淺不一;③角色色(ROLE_TONE)無法在元件層強制。
 *
 * 本檔把「tone → class」收斂成唯一來源:任何元件一律 `import { TONE, type Tone }`,
 * 依需要取 `TONE[tone].soft / .solid / .fill / .outlined / .text / .ring / .dot`,
 * 禁止再於元件內各自手抄對照表。新增顏色或調整深淺只改此一處。
 *
 * 面向(facet)語彙:
 *  - soft     淺底徽章/膠囊:bg-50 + 深色文字 + ring-200(Chip soft、狀態徽章)
 *  - solid    實心填色徽章:bg-600 + 白字(neutral=800);小型實心 Chip/標記
 *  - fill     純填色(無文字):bg-600(neutral=outline-variant 淺灰);長條/進度/時間軸節點/堆疊段
 *  - outlined 描邊:透明底 + text-700 + border-300
 *  - text     純語意文字色:text-700
 *  - ring     ring-200(細描邊環/分隔)
 *  - dot      小圓點/細強調條:bg-500(比 fill 亮,適合 ≤ 12px 元素)
 *
 * 深淺基準(2026-07 批72 統一):實心一律 600(取代散落的 500/container/100),文字 700,點 500,淺底 50。
 */

export type Tone = 'neutral' | 'primary' | 'sage' | 'success' | 'warning' | 'danger';
export const TONES: Tone[] = ['neutral', 'primary', 'sage', 'success', 'warning', 'danger'];

type ToneFacets = {
  soft: string;
  solid: string;
  fill: string;
  outlined: string;
  text: string;
  ring: string;
  dot: string;
};

export const TONE: Record<Tone, ToneFacets> = {
  neutral: {
    // soft 補 ring:neutral 原是唯一無描邊的 tone,在 bg-paper-sunk 面(UserMenu 選單等)上
    // 與背景同色而完全隱形(UAT:觀察員標籤看不出是標籤)——比照其餘 tone 的「淺底+ring」型式
    soft:     'bg-paper-sunk text-ink-700 ring-1 ring-inset ring-rule-strong',
    solid:    'bg-neutral-800 text-white',
    fill:     'bg-rule-strong',
    outlined: 'bg-transparent text-ink-500 border border-rule',
    text:     'text-ink-500',
    ring:     'ring-rule',
    dot:      'bg-neutral-500',
  },
  primary: {
    soft:     'bg-primary-50 text-primary-800 ring-1 ring-inset ring-primary-200',
    solid:    'bg-primary-600 text-white',
    fill:     'bg-primary-600',
    outlined: 'bg-transparent text-primary-700 border border-primary-300',
    text:     'text-primary-700',
    ring:     'ring-primary-200',
    dot:      'bg-primary-500',
  },
  sage: {
    soft:     'bg-sage-50 text-sage-800 ring-1 ring-inset ring-sage-200',
    solid:    'bg-sage-600 text-white',
    fill:     'bg-sage-600',
    outlined: 'bg-transparent text-sage-700 border border-sage-300',
    text:     'text-sage-700',
    ring:     'ring-sage-200',
    dot:      'bg-sage-500',
  },
  success: {
    soft:     'bg-success-50 text-success-700 ring-1 ring-inset ring-success-200',
    solid:    'bg-success-600 text-white',
    fill:     'bg-success-600',
    outlined: 'bg-transparent text-success-700 border border-success-300',
    text:     'text-success-700',
    ring:     'ring-success-200',
    dot:      'bg-success-500',
  },
  warning: {
    soft:     'bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-200',
    solid:    'bg-warning-600 text-white',
    fill:     'bg-warning-600',
    outlined: 'bg-transparent text-warning-700 border border-warning-300',
    text:     'text-warning-700',
    ring:     'ring-warning-200',
    dot:      'bg-warning-500',
  },
  danger: {
    soft:     'bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-200',
    solid:    'bg-danger-600 text-white',
    fill:     'bg-danger-600',
    outlined: 'bg-transparent text-danger-700 border border-danger-300',
    text:     'text-danger-700',
    ring:     'ring-danger-200',
    dot:      'bg-danger-500',
  },
};

/**
 * 資訊面(info surface)單一來源(設計精緻化 #14;批74)。
 * 收編填報/審查流散落的 `bg-primary-50/{30,40,50,60}` 實例層手挑 alpha 破窗
 * (AuditPad、ChecklistItemCard、prep、review、dashboard、ActionForm、PrepTemplateManager…):
 * 一律改吃這一支具名資訊面,讓 SoT 從型別層延伸到實例層。
 * 比 TONE.primary.soft 更淺一階(ring-100 而非 ring-200),作為「內部頁的一點柔藍體溫」。
 */
export const SURFACE_INFO = 'bg-primary-50 ring-1 ring-inset ring-primary-100';

/**
 * 公告分類 → Tone 單一來源(設計精緻化 #14;批76)。
 * 原本 page.tsx / news/page.tsx / news/[slug]/page.tsx 各自手抄一份 CATEGORY_TONE(+CATEGORY_BAR),
 * 改分類色要改三處必漏——比照既有 POST_CATEGORY_LABELS,收斂為單一匯出。
 * 分類色帶(原 CATEGORY_BAR 的 bg-*-500)一律改讀 TONE[tone].dot,不再另立一份。
 */
export const POST_CATEGORY_TONE: Record<PostCategory, Tone> = {
  ANNOUNCEMENT: 'primary',
  INTEL:        'sage',
  VULN_ALERT:   'danger',
  EVENT:        'warning',
};

// ── 角色色(北極星②:角色是一級資訊架構)——全部由 ROLE_TONE 單一來源衍生 ──
// ROLE_TONE(types.ts):中心 SUPER_ADMIN=primary、委員 AUDITOR=sage、機關 ORG_ADMIN=warning。
// 以下工具讓「角色 → 具體 class」也只有一份,消除 TopStrip/UserMenu 各自硬編角色色的破窗。

/** 角色 → 語意 Tone(轉手 ROLE_TONE,供傳入吃 Tone 的元件如 Chip) */
export function roleTone(role: Role): Tone {
  return ROLE_TONE[role];
}

/** 角色 → 頂端色帶 class(TopStrip 全站唯一常駐角色訊號):中心藍/委員綠/機關琥珀/觀察員墨灰。
 *  ⚠️必用完整靜態 class 字串——Tailwind JIT 不掃描 `border-t-${x}-600` 這類動態拼接。 */
const ROLE_BORDER_TOP: Record<Role, string> = {
  SUPER_ADMIN: 'border-t-primary-600',
  AUDITOR:     'border-t-sage-600',
  ORG_ADMIN:   'border-t-warning-600',
  OBSERVER:    'border-t-ink-500',
};
export function roleBorderTop(role: Role): string {
  return ROLE_BORDER_TOP[role];
}

/** 角色 → 頭像 tonal 底色(UserMenu 圓形頭像);由角色 Tone 的淺底衍生,深淺一致 */
export const ROLE_SURFACE: Record<Role, string> = {
  SUPER_ADMIN: 'bg-focus-wash text-primary-700',
  AUDITOR:     'bg-sage-100 text-sage-800',
  ORG_ADMIN:   'bg-warning-100 text-warning-800',
  OBSERVER:    'bg-paper-sunk text-ink-700 ring-1 ring-inset ring-rule-strong',
};
