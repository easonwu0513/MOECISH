# MOECISH 設計系統

> 單一真實來源。動任何畫面前先查這份;**不要新增**這裡沒有的顏色、圓角、字級或陰影 ——
> 需要而系統未涵蓋時,先在此補定義再用,不要在元件裡寫死(hardcode)。
>
> 實作位置:設計 token 在 [`tailwind.config.ts`](../tailwind.config.ts),全域變數與 utility 在
> [`src/app/globals.css`](../src/app/globals.css),元件在 [`src/components/ui/`](../src/components/ui/)。
> 風格:Material 3 改寫,深藍 primary(對齊 NTU ISMS),企業級冷白底。

---

## 1. 設計 Token

### 顏色

全部以 Tailwind 類別使用(`bg-primary-600`、`text-danger-700`…),**禁止寫 hex**。

| 色族 | 階層 | 用途 |
|---|---|---|
| `primary` | 50–950 | 主色(深藍)。主要動作、連結、選中態。常用 600(填色)/700(文字) |
| `sage` | 50–900 | 次色(灰綠)。輔助標示、資料準備類模組 |
| `tertiary` | 50–900 | 暖琥珀。慶祝/點綴,低調使用 |
| `success` | 50–900 | 成功、通過、符合 |
| `warning` | 50–900 | 警示、退回、部分符合、逾期 |
| `danger` | 50–900 | 錯誤、刪除、不符合、重要公告 |
| `neutral` | 0–900 | 文字與線條灰階(冷調) |

語意色階一律 50→900(2026-06 補齊 800/900,與 primary 對稱)。深色文字用 700–900,底色用 50–100,實心強調用 500–600。

**M3 表面角色**(語意命名,優先用這些而非 neutral 數字):

| Token | 用途 |
|---|---|
| `surface` | App 背景(冷白 #f6f8fb) |
| `surface-container-lowest` → `-highest` | 卡片/面板由淺到深的層級 |
| `on-surface` / `on-surface-variant` | 主要 / 次要文字 |
| `outline` / `outline-variant` | 邊框 / 淺邊框 |
| `primary-container` / `on-primary-container` | tonal 元件底色 / 其上文字 |

### 字體

`font-sans`(預設)= Inter + **Noto Sans TC**(中文)+ 系統 fallback;`font-mono` = JetBrains Mono(代碼、Email、時間戳)。三套經 `next/font` 載入,變數定義於 [globals.css](../src/app/globals.css) `:root`。

### 字級(語意命名,**禁止** `text-[14px]` 這種寫死)

| 類別 | 大小 | 用途 |
|---|---|---|
| `text-display` / `display-sm` / `display-lg` | 44 / 36 / 56px | 首頁 Hero、大數字 |
| `text-headline` / `-sm` / `-lg` | 28 / 24 / 32px | 頁面主標題 |
| `text-title-lg` / `title-md` / `title` | 22 / 16 / 15px | 區塊 / 卡片標題 |
| `text-body-lg` / `body` / `body-sm` | 16 / 15 / 13px | 內文,`body-sm` 最常用 |
| `text-label-lg` / `label` / `label-sm` | 14 / 12 / 11px | 按鈕、標籤、表頭 |
| `text-caption` | 12px | 輔助說明、時間 |

### 圓角 / 陰影 / 動態

- **圓角**:`rounded-xs`(4)`sm`(6)預設(10)`md`(12)`lg`(16)`xl`(20)`2xl`(24)`3xl`(28)。卡片用 `md`/`lg`,按鈕一律膠囊 `rounded-full`,Chip `rounded-full`。
- **陰影**:`shadow-elev-1`→`elev-5`(層級遞增,冷調)。卡片靜態 elev-1~2,懸浮 elev-2~3,對話框 elev-5。**焦點**一律用 `.focus-ring` utility,不要自刻。
- **動態**:`animate-fade-in` / `slide-up` / `slide-in-right` / `soft-pulse`;easing 用 `ease-standard` / `ease-emphasized-decel`;duration 100/200/300/400。**務必尊重 `prefers-reduced-motion`**(globals 已全域降速,首頁輪播另有明確關閉)。

### 間距

用 Tailwind 預設間距尺度(`p-4`、`gap-3`、`mb-6`…),**無自訂尺度**。頁面容器慣例:`max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8`。

---

## 2. 元件庫(`src/components/ui/`)

優先用既有元件,不要重刻。完整清單見目錄;高頻元件:

| 元件 | 重點 API |
|---|---|
| `Button` | `variant`(見下)、`size` xs/sm/md/lg、`loading`、`leadingIcon`、`href`(渲染為 `<a>`) |
| `IconButton` / `FAB` | 純圖示鈕 / 浮動動作鈕,**必填 `label`**(無障礙) |
| `TextField` / `Textarea` / `Select` | `label`、`errorText`、`helperText`;浮動標籤;`aria-invalid` 自動 |
| `Dialog` / `ConfirmDialog` | 置中彈窗(見 §3);焦點陷阱 + Escape + 還原焦點 |
| `Sheet` | 側邊抽屜原語(見 §3) |
| `Card`(+ `CardTitle`/`CardDescription`) | `variant` elevated/filled/outlined、`interactive`、`padded` |
| `Chip` | `tone`(6 色)、`variant` soft/outlined/filled、`size`、`dot` |
| `Toast`(`useToast()`) | `.success/.error/.warning/.info`;成功宜安靜,失敗才跳 |
| `Segmented` | 單選分段(符合度填答用);radiogroup 無障礙 |
| `ProgressBar` / `ProgressRing` / `StackedBar` | `tone`、`value`/`max`;`StackedBar` 多段堆疊(語意 token,讀出組成) |
| `Tooltip` | hover + 鍵盤聚焦 + Escape;`side` |
| `EmptyState` / `Skeleton` | 空狀態 / 載入骨架(見 §4) |
| `FilterChip*` / `TableScroll` / `Timeline` / `Tabs` / `CommandPalette` | 篩選籤 / 表格捲動 / 時間軸 / 分頁 / 命令面板(⌘K) |

### ③ 工作台組合元件(`src/components/dashboard/`,UI/UX 大改造引入)

採「政府級莊重」設計語言;**身分帶 → 唯一主行動橫幅 → 公文式秩序次層卡 + 資料讀數** 的工作台骨架,儀表板與週期頁共用,不新增顏色 token。

| 元件 | 用途 |
|---|---|
| `IdentityBand` | 身分帶:頭像 + 姓名/問候 + 角色徽章 + 範圍 + 右側讀數;定位「我是誰、在哪、多少待辦」 |
| `PrimaryActionBanner` | 「建議的下一步」主行動橫幅,直接吃 `nextActionForRole` 的 `NextAction`;**全頁唯一飽和色**,自連本頁時不顯示 CTA |
| `StageFlowRail` | 7 階段引導流程帶(由 [lib/stage.ts](../src/lib/stage.ts) SoT 驅動);週期頁主視覺,取代 4 步 `CycleStepper`(儀表板卡片仍用精簡 4 步) |

### Button 變體(2026-06 統一,**只用這套詞彙**)

| variant | 用於 | 視覺 |
|---|---|---|
| `filled`(預設) | 主要動作(送出、建立、確認) | 實心 primary |
| `tonal` | 次要但顯眼(回上頁、輔助操作) | primary-container 底 |
| `outlined` | 次要動作 | 外框透明 |
| `text` | 低強調、primary 色 | 純文字 |
| `ghost` | 最低強調、中性色(取消、關閉) | 純文字中性 |
| `danger` / `success` / `warning` | 語意動作(刪除 / 通過 / 退回) | 對應語意實心 |
| `elevated` | 少用,需浮起感的次要鈕 | surface + 陰影 |

> ⚠️ 已移除舊別名 `primary`/`secondary`(等同 filled/outlined)。新程式碼勿再使用。

---

## 3. 抽屜 vs 彈窗(Dialog vs Sheet)

兩者都是模態(覆蓋背景、鎖捲動、Escape 關閉)。選擇準則:

| 用 **Dialog**(置中彈窗)當… | 用 **Sheet**(側邊抽屜)當… |
|---|---|
| 聚焦單一決定或短表單(確認、新增醫院、開週期、退回原因) | 內容較長、需與主畫面並存參照(長表單、明細側板) |
| 內容 ≤ 一螢幕,`size` sm/md/lg 夠用 | 需要垂直長捲動 |
| **系統現況:全站表單都用 Dialog** | 側板原語,目前未在頁面使用;新增長側板需求時才採用 |
| 破壞性操作 → `ConfirmDialog` + `tone="danger"` | — |

**手機版導覽**另走 AppShell 內建的左側抽屜(非 Sheet 元件),屬框架既有行為。

共同規則:標題用 `title`(自動 `aria-labelledby`);破壞性確認務必 `ConfirmDialog`;`loading` 期間鎖關閉。

---

## 4. 空狀態與載入狀態

| 情境 | 用什麼 |
|---|---|
| 清單 / 查詢無資料 | `<EmptyState icon title description action?>`(action 給「清除條件」「新增第一筆」這類出口) |
| 區塊資料載入中 | `<Skeleton>` / `<SkeletonLine>` 佔位,維持版面不跳動 |
| 按鈕送出中 | `<Button loading>`(自動換 Spinner、鎖點擊) |
| 局部即時動作 | 卡片內就地回饋(如檢核表「✓ 已儲存」小綠勾),**成功不跳 Toast**;失敗才 `toast.error` |
| 純載入指示 | `<Spinner>`(已含 `role=status` + aria-label) |

原則:**有資料前先佔位,不要空白閃爍;成功安靜、失敗明顯。**

---

## 5. 無障礙基線(已內建,沿用即可)

- 互動元件皆有 `.focus-ring` 焦點環(全站單一樣式);純圖示鈕必填 `label`。
- 對話框:焦點陷阱、Escape、關閉後還原焦點(`Dialog` 已處理)。
- 表單:`label` 連結 + `aria-invalid`;Segmented/Tabs/ProgressBar 有對應 ARIA role。
- 尊重 `prefers-reduced-motion`。
- 顏色不單獨承載語意 —— Chip/狀態同時用文字或圖示,不只靠顏色。
- 觸控裝置(`@media (pointer:coarse)`)互動命中區自動 ≥44×44px(`Button`/`IconButton` 已內建;`FilterChip` 以 `after` 偽元素延伸)。

---

## 6. 邏輯單一真實來源(SoT)

畫面文案/結構也有 SoT,**不要在消費端硬編、避免兩處漂移**。動到下列任一概念前,改它的來源檔,消費端會自動同步:

| 概念 | 來源檔 | 派生的消費端 |
|---|---|---|
| 導覽(路由 label/allow/icon/分組) | [`src/components/shell/nav-map.tsx`](../src/components/shell/nav-map.tsx) | 側欄 `Sidebar`、命令面板 `⌘K`(AppShell)。新增/改名後台頁只動這裡 |
| 週期階段(7 態 label/tone、4 步流程、狀態→步驟) | [`src/lib/stage.ts`](../src/lib/stage.ts) | `state-machine.ts`、`process-guide.ts` 皆 re-export;Chip、`CycleStepper`、首頁服務卡 |
| 角色名詞 / 色調 | [`src/lib/types.ts`](../src/lib/types.ts) `ROLE_LABELS` / `ROLE_TONE` | 全站角色 Chip 與標籤 |
| 角色化「下一步」與儀表板待辦 | [`src/lib/process-guide.ts`](../src/lib/process-guide.ts) `deriveCycleFacts` / `nextActionForRole` | 週期頁下一步橫幅、儀表板待辦卡 |
| 問候語 / 共用微文案 | [`src/lib/copy.ts`](../src/lib/copy.ts) | 首頁問候等 |

---

## 7. 給 AI / 新進開發者的規則

1. 動任何畫面或元件前,**先查本文件與 `tailwind.config.ts`**。
2. 寫任何顏色、間距、字級、圓角前,先確認系統已定義 → 用 token,不要寫死數值或 hex。
3. 需要的東西系統沒有 → **停下來,先在 token 補定義**(並更新本文件),不要在元件裡發明一次性的值。
4. 既有元件能用就用,不要重刻 Button/Dialog/Card 之類。
5. 例外隔離區:`src/components/audit-merge/`(從單檔 HTML 工具 1:1 移植)刻意脫離本系統、用 Tailwind 預設色,**不要拿它當範本**,也不要去「修正」它。
6. 改導覽、階段、角色名詞、下一步文案前,先看「6. 邏輯 SoT」找到來源檔 —— **改來源,不要改側欄/⌘K/各頁的硬編**,否則兩處會漂移。
