# MOECISH SaaS 級精修路線圖

> 產出方式:多代理審查大軍(16 維度/原型掃描 → 158 條原始發現 → 64 主題 → 對抗式驗證保留 60)
> 日期:2026-06-20 · 對版 a2b0ac4 · 82 agents / 5.3M tokens
> 性質:純讀碼分析,未動任何檔案。每條皆附 file:line + 現況 + 具體改法。

## 現況總評

MOECISH 在「企業範本 → premium SaaS」光譜上,**設計系統的「材料」已是 premium 級,但「施工紀律」還停在企業範本級**。Token 系統(M3 完整階梯)、元件庫(25 個 UI + 8 個 shell)、motion easing/duration 都已備齊,缺的不是更多功能或更多元件,而是讓既有材料一致落地的紀律。三個最大的系統性差距:

1. **平行系統洩漏** —— 同一視覺角色被就地重寫成多份:8 份手刻表格、3 套浮起卡配方、4–5 套語意提示權重、CommandPalette/audit-merge 兩個「token 孤島」、scrim 三種寫法、ROLE_TONE 抄 7 份(導致同一角色跨頁變色)。這是 premium 系統最致命的破口——使用者感覺「像好幾個產品拼起來」。
2. **狀態覆蓋殘缺** —— 零 `not-found.tsx`/`error.tsx`、Skeleton 是 dead code 且用錯色、空狀態手刻分岔、篩選後 0 筆印「尚無紀錄」誤導稽核員。失敗/載入/空三態是 premium 與範本的分水嶺。
3. **動態與感知效能扁平** —— 彈層只有進場無退場(硬切)、無全域導航進度條(「點了像沒反應」)、無存檔正向確認(死碼勾號)、dashboard 整頁冷彈入。Linear/Stripe 的「快」一半是真效能、一半是這些感知訊號。

---

## 🟢 快贏 Quick Wins(effort S,改 token/共用元件全站見效)

### 1. tone→單一來源:修跨頁角色變色 + 收斂色票常數 · [high / S] · baseline
**檔案**:`src/lib/types.ts:8`、`src/components/shell/UserMenu.tsx:11,16`、`src/app/dashboard/page.tsx:364`、`src/components/ui/StatTopBar.tsx:31`、`src/app/admin/scores/page.tsx:18`、`src/app/cycles/[id]/page.tsx:318`
**改法**:
- **段 1(真 bug)**:`types.ts` 新增 `export const ROLE_TONE: Record<Role,'primary'|'sage'|'warning'> = { SUPER_ADMIN:'primary', AUDITOR:'sage', ORG_ADMIN:'warning' }`(以 UserMenu 既有對應為準)。`dashboard:364` 把寫死的 `tone="primary"` 改 `tone={ROLE_TONE[user.role]}`,修掉 AUDITOR 在 dashboard 顯藍、UserMenu 顯綠的矛盾。刪 7 處本地抄寫的 `roleLabel`(UserMenu/lib/invite/invite page/admin users/UserRowActions/org [id]/api invitations route)改 import `ROLE_LABELS`。
- **段 2**:新增 `src/lib/tone.ts` 匯出 `TONAL_SWATCH: Record<Tone,string>`(以 StatTopBar 6-tone 版為準),StatTopBar/scores TONE_BG/ModuleTile 三檔改 import。
- 不動 UserMenu avatarBg(用 -container/-100/-800 階,不同視覺語彙)。

### 2. 數字一律 tabular-nums(Chip 根類別一次全站見效)· [medium / S] · signature
**檔案**:`src/components/ui/Chip.tsx:82`、`src/components/ui/StatTopBar.tsx:52`、`src/app/admin/cycles/page.tsx:196`
**改法**:Chip base class `'inline-flex items-center font-medium whitespace-nowrap'` → 末尾加 ` tabular-nums`(一次涵蓋 DeadlineChip 倒數、停滯天數、計數 Chip);StatTopBar:52 sub 容器加 `tabular-nums`;cycles 截止日期 td 加 `tabular-nums`。**不要**動已正確 tabular 的欄、不要引入不存在的 DataTable 全欄統一規則(會覆寫已正確的欄=churn)。

### 3. Skeleton 用對色 + 收編 news 手刻骨架 · [medium / S] · baseline
**檔案**:`src/components/ui/Skeleton.tsx:7`、`src/app/news/loading.tsx:8`、`src/app/news/[slug]/loading.tsx`
**改法**:`bg-neutral-200` → `bg-surface-container-high`(對齊 token 與 news 實戰用色,純一致化零風險);兩個 news `loading.tsx` 手刻 `animate-pulse bg-surface-container-high` div 換成 `<Skeleton>`,消除平行系統。

### 4. 浮起卡與 auth 卡一致化(縮範圍,勿動共用 Card 背景階)· [medium / S] · baseline
**檔案**:`src/app/login/page.tsx:87`、`src/app/dashboard/page.tsx:185,361`
**改法**:只做兩條安全一致化 —— login 卡 `shadow-elev-2` → `shadow-elev-1`(與 invite 對齊);dashboard 同頁「有 border 無 shadow」的 section(185/361)補 `shadow-elev-1`(與相鄰 StatTopBar 同類區塊一致)。**不採納**原文「全站統一成 Card 無 border」(會逆轉 35 檔既有 border 主流配方)。

### 5. 明細頁日期統一民國年 · [high / S] · baseline
**檔案**:`src/app/admin/organizations/[id]/page.tsx:66,101,127,170,178`、`src/app/admin/users/page.tsx:87,139`、`src/app/admin/audit-log/page.tsx:164`、`src/app/admin/posts/page.tsx:86`、`src/app/admin/emails/page.tsx:182`
**改法**:9 處 `toLocale*` 改 `lib/date` 的 `fmtROC`/`fmtROCDateTime`。**注意:這 5 檔均「未」import @/lib/date**,每檔要新增 import(原建議「都已 import」為假)。org[id] 同一列「115 年 / 2026/6/30」並列是最傷可信度的硬傷;順手把 `{c.year - 1911} 年` 改 `rocYear()`,日期 td 補 tabular-nums。保留既有 null fallback(`—`/「尚未登入」)。

### 6. 篩選後空狀態文案修正 + dashboard 空態死路 · [high / S] · baseline
**檔案**:`src/app/admin/audit-log/page.tsx:145`、`src/app/admin/scores/page.tsx:96`、`src/app/dashboard/page.tsx:171,308`、`src/app/news/page.tsx:65`、`src/lib/copy.ts:20`
**改法**(價值序 4>3>1>2):
- **(4) 最高價值**:dashboard `cycles.length===0` 時依角色分歧 —— SUPER_ADMIN 給 `action={<開立稽核週期(tonal)+ 醫院管理(text)>}`(EmptyState 已支援 action prop 卻沒傳)+ 主動文案;AUDITOR/ORG_ADMIN 維持等待文案。修掉「能開週期的人看到叫他等別人」的死路。
- **(3)**:audit-log/scores 篩出 0 筆改用 `EMPTY.noResults`(copy.ts 已有),把既有「清除」連結放進 EmptyState 的 action。修掉「稽核軌跡頁印『尚無紀錄』讓計中誤判系統沒留軌跡」。
- **(1)**:dashboard 待辦手刻 div 換 `<EmptyState tone="success">`(EmptyState 加極小 tone prop,圓底依 tone 切色)。
- **(2)**:news 裸 div 改 `<Card variant="outlined">` 包 EmptyState,與 audit-log/scores 對齊。

### 7. tabular/截斷紀律:CJK 待辦標題改 line-clamp + 截斷補 title · [high / S→M] · baseline
**檔案**:`src/app/dashboard/page.tsx:286,336`、`src/components/ui/StatTopBar.tsx:52`、`src/app/dashboard/page.tsx:265`、`src/app/cycles/page.tsx:68`
**改法**:待辦標題 `truncate` → `line-clamp-2 leading-snug`(CJK 無單字邊界,truncate 把「(截止 6/30)」靜默切掉);286 行 next.text 同改。機關名 truncate 處補 `title={...}` 補可恢復性;StatTopBar sub 容器加 `title={sub}`。**不做** DeadlineChip 拆字串(要改 Todo type + 全 call site,屬重構,line-clamp-2 已解決資訊遺失)。

### 8. skip-to-content 連結 + main landmark · [medium / S] · baseline
**檔案**:`src/app/layout.tsx:37`、`src/components/shell/AppShell.tsx:79`
**改法**:body 第一個子元素(Providers 之前)加 `<a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] ... focus:bg-primary-container focus:text-on-primary-container focus-ring">跳至主要內容</a>`;`main` 加 `id="main-content" tabIndex={-1}`(不需 role="main"/aria-label,`<main>` 已隱含)。修 WCAG 2.4.1(SUPER_ADMIN 側欄 10 連結每頁 Tab ~10 次)。

### 9. 麵包屑壞鏈 + cycles 三種講法 · [medium / S] · baseline
**檔案**:8 個 admin 頁(audit-log:96/cycles:94/organizations/users/scores/checklists/posts/emails)、`src/components/shell/Sidebar.tsx:54`
**改法**:8 頁 crumbs 首段 `{ label:'管理', href:'/admin/organizations' }` → `{ label:'管理' }`(去 href;Breadcrumbs 已支援無 href 渲染純 span)。修掉 AUDITOR 點「管理」被靜默彈回 dashboard(「管理」是群組標題非頁面)。cycles 三處統一為「跨院週期總覽」(sidebar/crumb 末段/h1),解決與 /cycles 撞名。

### 10. 觸控目標 44px + Toast 錯誤改 assertive · [medium / S] · baseline
**檔案**:`src/app/login/page.tsx:106`、`src/components/ui/FilterChip.tsx:11`、`src/components/portal/PortalHeader.tsx:18`、`src/components/ui/Toast.tsx:91`
**改法**:login 眼睛鈕**移除 `tabIndex={-1}`**(真 a11y bug:鍵盤無法切換密碼顯示)+ 透明熱區 `before:-inset-1.5`;FilterChip 加垂直透明熱區 `relative after:inset-x-0 after:-inset-y-1`(視覺 h-9 不變);PortalHeader 行動連結 `min-h-[44px] inline-flex items-center`;Toast `role={t.type==='error'||'warning'?'alert':'status'}`。

### 11. scrim 與 duration-180 收進 token(修隱性 bug)· [medium / S] · signature
**檔案**:`src/components/ui/Dialog.tsx:94`、`src/components/ui/Sheet.tsx:41`、`src/components/ui/CommandPalette.tsx:94`、`src/components/shell/AppShell.tsx:65`、`src/app/cycles/[id]/checklist/ChecklistItemCard.tsx:250`、`ChecklistShell.tsx:367,396`
**改法**:globals.css `@layer components` 加 `.scrim`(`rgba(20,20,30,0.32)` + `blur(2px)`),4 處遮罩 div className 換 `scrim`(行動抽屜獲得它缺的 blur、CommandPalette 收斂冷色調)。`duration-180` 三處 → `duration-200` —— **這是隱性 bug**:config 無 180 階,`duration-180` 不產生任何 CSS class,過渡實際以 0s 瞬間執行,意圖的動畫從未生效。

### 12. dashboard emoji 換 icon + landing 陰影/Button lg 回 token · [low / S] · baseline
**檔案**:`src/app/dashboard/page.tsx:206`、`src/app/page.tsx:176,199,361,336`、`src/components/ui/Button.tsx:79`
**改法**:dashboard 逾期警示字面 `⚠` 換 `<AlertTriangle size={13} className="text-danger-600">`;landing 三處 inline boxShadow(176/199/361,後兩處已有 shadow-elev class 卻被 inline 覆蓋=死碼)刪掉改 class + `.elev-inset-hi` utility;Button lg `text-body` → `text-label-lg`(唯一破例);CTA 漸層 inline hex 改 `var(--primary-900/800/700)`。**不新增 inverse Button variant**(單一用例擴張矩陣)。

---

## 🟡 結構精修 Structural(effort M/L,表格系統、狀態覆蓋、頁面標準化)

### 13. 補全 not-found / error / global-error · [high / M] · baseline
**檔案**:新增 `src/app/not-found.tsx`、`error.tsx`、`global-error.tsx`(範本 `src/app/invite/[token]/page.tsx:42`)
**改法**:沿用 invite 失效態版型(置中卡 max-w-[440px] + Logo + 圓 icon)。**not-found**(server)用中性色(找不到非錯誤)+「回總覽」tonal;**error**('use client',`{error,reset}`)danger 圓圈 + 複用 `copy.ts:47 TOAST.networkError` + 「重新整理」(reset)+ 可選 `error.digest` 錯誤代碼;**global-error** 必須自帶 `<html lang="zh-Hant"><body>`(取代 root layout,字型 CSS var 無法注入,接受系統字型降級)。三支缺一不可(notFound() 拋 NEXT_NOT_FOUND 只被 not-found 接)。15 個檔呼叫 `notFound()`,production 現顯英文白頁——對政府/醫療場域是觀感硬傷。**驗收 global-error 需 `next build && next start`**。

### 14. 抽 DataTable 原語,終結 8 份手刻表格 · [high / L] · signature
**檔案**:新增 `src/components/ui/DataTable.tsx`、`src/components/ui/index.ts`、7 張 uniform 表(users/audit-log/organizations/cycles/emails/posts/checklists)+ scores
**改法**:匯出 `Table/THead/Th/Tr/Td`。THead 內建 `text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low`(scores 漏的 `uppercase tracking-wide` 換上即自動修好);Td `density?:'default'|'compact'`(吃掉 py-3.5 手滑)、`numeric` 帶 `text-right tabular-nums whitespace-nowrap`;Tr `hover:bg-surface-container-low transition-colors`(可關)。**範圍紀律**:7 張乾淨換上;scores 只採 Table/THead/Th 修 thead 漂移,**保留** bespoke tbody(sticky 首欄/tfoot 平均/per-cell tone);**排除** org[id] 3 張 headerless 表與 print/report 表。這是 sticky/zebra/排序/筆數的載體。

### 15. 長表 hover 一致 + scores 輕量 zebra(sticky 先原型驗證)· [medium / M] · signature
**檔案**:`src/app/admin/emails/page.tsx:180`、`src/app/admin/users/page.tsx:77`、`src/app/admin/organizations/[id]/page.tsx:89`、`src/app/admin/scores/page.tsx:116`
**改法**:**hover 一致化(高把握,立即做)**:三處 tr 補 `hover:bg-surface-container-low transition-colors`;**scores zebra**:tbody tr 加 `even:bg-surface-container-lowest/40`(首欄 td 同步 `even:` 否則色帶斷層更明顯)。**sticky thead 被高估**:現架構下 `top-0` 會卡在 TopStrip 下方需 `top-16`,且 thead 包在 `overflow-x-auto` 內會觸發「sticky 在 overflow:auto 失效」陷阱——**先在 audit-log 單頁原型 + preview 截圖驗證**再決定推廣,別盲改 11 表。

### 16. 抽 PageHeader 統一 20+ 頁標題骨架 · [high / M] · signature
**檔案**:新增 `src/components/shell/PageHeader.tsx`,替換 9+ 手刻 header(cycles[id]/admin users/admin cycles/admin posts/organizations(+[id])/checklists[id]/deficiencies(+[defId]))
**改法**:props 收斂為 `{ title, subtitle?, eyebrow?, chips?, actions? }`(**去掉 backHref** —— AppShell 頁已有 Breadcrumbs,加 backHref 是與既有導航重複的淨新裝飾)。固定版型:`mb-6 flex items-start justify-between gap-4 flex-wrap`,h1 `text-headline text-on-surface`(統一,dashboard `display-sm` hero 維持例外),subtitle `mt-1 text-body-sm text-on-surface-variant`。**排除** dashboard hero、cycles[id]/print(列印文件)。

### 17. tone→單一來源段 3:TonalIcon 容器半徑紀律 · [high / M] · baseline
**檔案**:新增 `src/components/ui/TonalIcon.tsx`,`StatTopBar.tsx:44`、`cycles/[id]/page.tsx:328`(ModuleTile)
**改法**:props `tone, size(sm/md/lg → w-9/w-11/w-14)`,預設 `rounded-lg`,取 `TONAL_SWATCH`。StatTopBar(`rounded-full`)/ModuleTile(`rounded-lg`)圖示底改用之;`rounded-full` 僅留真頭像與數字圈。承接快贏 #1 的 tone 收斂。

### 18. 描邊面板 + 語意提示 recipe(抽 Alert)· [medium / M] · 混合
**檔案**:`src/components/ui/Card.tsx:36`、新增 `src/components/ui/Alert.tsx`,收編 login:120/invite/PrepBoard:248/deficiencies:202/SubmissionBanner:109/ChecklistItemCard
**改法**:
- **A(baseline,實為 S)**:Card outlined `bg-surface` → `bg-surface-container-lowest border-outline-variant/60`(向 8 處手刻面板多數靠攏,1 行改動);8 處手刻面板維持原語意標籤不動。
- **B(signature,真缺口)**:新增 `<Alert tone>`(色票複用 Chip softTones 的 `ring-1 ring-inset`,**不另加 border** 避免雙描邊),收「橫幅級」通知;密集內嵌泡泡(review 留言)保留輕量不升 200。修掉 5 種描邊權重並存讓讀者無法靠深淺判層級。可與 #19「Alert/Callout」合併為同一個 Alert 元件。

### 19. inline Alert/Callout 原子(與 #18B 合併)· [medium / M] · baseline
**檔案**:同 #18,加 `PrepBoard.tsx:248`
**改法**:同一個 `Alert.tsx`,殼 `flex items-start gap-2 rounded-md px-3 py-2.5 text-body-sm animate-fade-in`,有 title 時 `flex-col`;deficiencies:203 圓 icon 版做 `emphasis='strong'` 變體。**#18B 與 #19 是同一件事,實作時併為一個元件**,消除 login/invite/PrepBoard 三種半徑兩種內距漂移。

### 20. errorText 死碼接線 + a11y describedby · [high / M] · baseline
**檔案**:`src/components/ui/TextField.tsx:106`、`Textarea.tsx:72`、`Select.tsx:51`、`PasswordForm.tsx:18`、`CreateOrganizationButton.tsx`、`PostEditor.tsx:39`
**改法**:三元件 errorText 已完整實作(aria-invalid/danger 底線/文字)但全站 grep `errorText=` 為 0=死碼。只針對「submit 前 client 驗證」三處接線(PasswordForm 兩次不一致、CreateOrg 必填、PostEditor 標題/內文),取代 toast.error,first-error `.focus()`;**伺服器層 `if(!res.ok) toast.error` 99 處維持不動**。a11y:三元件補 `aria-describedby={(hasError||helperText)?descId:undefined}`,`<p>` 加 id(目前 SR 只念「無效」念不到原因)。

### 21. DS 化 Checkbox/Radio,取代 9 處裸 native input · [high / M] · signature
**檔案**:新增 `src/components/ui/Checkbox.tsx`+`Radio.tsx`,替換 PostEditor/ActionForm/BatchCreateCycles/BatchAssignAuditors/CreateCycleButton/FindingItem
**改法**:peer 技法(native input `peer sr-only` 保留語意,span 自繪),18×18 `rounded-[5px] border-2 border-outline peer-checked:bg-primary-600` + 自繪 SVG 勾號 + `peer-focus-visible:ring-2`(**補上目前全缺的鍵盤焦點環**)。**範圍修正**:ActionForm 兩組已是 selection-card,**不重做卡片**只換內部 input;追加更髒的 `FindingItem.tsx:153`(`accent-orange-500` + 裸 slate/red/orange 色)同批換掉。消除全站最明顯的「瀏覽器原生味」。

### 22. 必填標記 + field-group label 語彙統一 · [high / M] · baseline
**檔案**:`TextField.tsx:69`、`Select.tsx:24`、`globals.css:189`,各表單
**改法**:擴充既有 `.ds-label` → `.ds-field-label { @apply text-label-lg text-on-surface-variant mb-2 block }`(**沿用 ds- 前綴勿發明 .field-label**),取代散落的 `text-label text-on-surface(-variant)`。三元件加 `required?` prop → 渲染 `<span text-danger-600>*</span>` + `aria-required`,**並在表單頂部加「標示 * 為必填」圖例**(CJK 星號慣例弱)。約束/格式從 label 移到 helperText(InviteAcceptForm「至少 8 字元」)。一次 PR 收齊所有有必填語意的表單。

### 23. Dialog 表單包 form,Enter 可送出 · [medium / M] · signature
**檔案**:`src/components/ui/Dialog.tsx`、CreateOrganizationButton/GlobalInvitePanel/InvitePanel/CreateCycleButton/AddItemButton
**改法**:**直接包 form 在現況下不運作** —— Dialog 把 children 與 footer 渲染成並列 sibling div,footer 的 type=submit 落在 form 外。正解(A):Dialog 加 `onSubmit?` prop,有提供時把 children+footer **一起**包進 `<form onSubmit>`,對話框傳 `onSubmit={submit}` + 主按鈕 `type="submit"`,一次惠及全部對話框。範圍:單行 TextField 為主的對話框才套;多行 Textarea 編輯框(ItemActions/PostEditor)維持按鈕送出。

### 24. Dialog a11y 共用 hook(Sheet/行動抽屜/UserMenu/Tabs)· [high / M] · baseline
**檔案**:新增 `useDialogA11y`,`Sheet.tsx:21`、`AppShell.tsx:62`、`UserMenu.tsx:42`、`Tabs.tsx:30`(範本 `Dialog.tsx:35`)
**改法**:抽 hook 封裝 restore/initial-focus/Tab-trap/Escape/overflow-lock(Dialog 已完整)。**行動抽屜完全裸**(無 role/aria-modal/Escape/焦點,手機主導覽純鍵盤不可用)= 最高優先,加 `role="dialog" aria-modal aria-label="主選單"`;Sheet 補 ref/initial-focus/h2 id;UserMenu 補 `aria-haspopup` + Escape + 方向鍵;Tabs 補 tab↔panel id 互指 + roving tabindex(複製 Segmented 既有範本)。**拆兩 PR**:行動抽屜+Sheet 先行。WCAG 2.1.2/2.4.3/4.1.2。

### 25. loading.tsx 補齊 + TableSkeleton · [medium / M] · signature
**檔案**:`Skeleton.tsx`(#3 已修色)、新增 TableSkeleton、高流量頁 loading.tsx
**改法**:**工程現實**:AppShell 在「每個 page 內」(admin/layout 僅 passthrough),loading.tsx 邊界拿不到 session,naive loading 會閃「無側欄裸骨架」。務實做法:loading.tsx 外框沿用 AppShell 內容區 padding(`max-w-screen-xl mx-auto px-4...py-8`),內放 TableSkeleton,接受側欄 loading 期間不渲染(仍比整頁空白好,max-w 對齊避免 layout shift)。優先高流量慢查詢頁:audit-log(take 200+2×groupBy)、scores(force-dynamic 聚合)、dashboard。「側欄不閃」屬大工程(AppShell 提升到 layout),不綁進本條。

### 26. 篩選列用元件 + 消除方角主鍵 · [medium / M] · baseline
**檔案**:`audit-log/page.tsx:124,137`、`emails/page.tsx:144`、`Button.tsx:75`
**改法**:**A(最高 CP,S)**:audit-log 套用鈕(`rounded-md bg-primary-600` 方角,全站唯一非膠囊主鍵)→ `<Button size="sm" type="submit">`;清除 → `<Button variant="ghost" size="sm" href={...}>`(Button 原生支援 href)。**B**:抽共用常數 `FILTER_CONTROL`(h-9 token class)套三個 native 控件統一視覺 + 補 hover。**不要**為「用元件」把篩選列全面 h-12/h-14 化(撐高破壞刻意的緊密密度=違反減法)、不加 client 即時篩選(現況 form GET 是刻意 SSR-friendly)。

### 27. audit-merge 平行系統收編 · [medium / L] · baseline
**檔案**:`AuditMergeTool.tsx`(126 處)、`FindingItem.tsx`、`audit-merge.css:22`
**改法**:**SUPER_ADMIN 限定批次工具,impact 校為 medium**(非全站)。切三批降風險:**批A** 機械色彩替換(slate→on-surface-variant、red→danger、green→success、amber→warning)+ 刪 Segoe UI;**批B** font-black(16+ 處)→ type-scale + tabular-nums + 漸層標題改 `text-headline-sm`;**批C** 手刻 pill→Button、emoji(🚨⚠️🛡️)→icons、shadow-xl→elev、`bg-[#eef2f6]`→`bg-surface-container`。**公文預覽(ReportContent + .report-content)共用 .amt-app scope,每批務必確認不波及列印版式**。

### 28. admin 表格排序 + 筆數/截斷提示 · [medium / L] · signature
**檔案**:`cycles/page.tsx:156`、`users/page.tsx:113`、`emails/page.tsx:75`、`audit-log/page.tsx:103`
**改法**:新增 server 友善 `SortableTh`(`<Link href={qs({sort,dir})}>` + Chevron,沿用各頁既有 qs() helper,**不引入 client 狀態**)。**關鍵校正:兩種排序不能混談** —— users.lastLoginAt、cycles.stallDays(→updatedAt)走 DB orderBy;scores.total、cycles.矯正進度是 JS 聚合,須對全載 rows in-memory sort(原建議「server orderBy 讀 searchParams」對這兩欄是錯的)。筆數:篩選列右端 `共 {N} 筆`;截斷:take:200 命中時才顯「顯示前 200 筆·請縮小範圍」。預設仍為現況 orderBy(行為不變)。

---

## ✨ Signature 觸感(讓它「感覺像 premium SaaS」,政府場域克制版)

### 29. 全域導航進度條 + justSaved 抽共用 · [high / M] · signature
**檔案**:新增 `src/components/shell/NavProgress.tsx`、`src/lib/useFlash.ts`、`AppShell.tsx`
**改法**:**機制校正** —— 原建議用 `usePathname` 偵測有缺陷(pathname 只在導航 commit 後才變,force-dynamic 深 prisma 頁的「點了沒反應」空窗反而不亮)。正解:AppShell(已 client)提供 `navigate(href)=startTransition(()=>router.push(href))`,isPending 經 context 給 NavProgress 顯 2px bar(`top-0 inset-x-0 h-[2px] bg-primary-600`,width 0→70% 緩升、結束 100% fade-out,用既有 `--dur-short-4`/`ease-emphasized-decel`)。至少把 Sidebar 高頻重頁點擊改 router 導航 + pending。`justSaved`(ChecklistItemCard)抽 `useFlash` hook 給 CommentForm 等高頻表單複用(`animate-fade-in`,勿發新 keyframes)。**Linear/Vercel 標配**。

### 30. 抽 SaveStatus 統一存檔三態 + 補死碼勾號 · [high→medium / M] · signature
**檔案**:新增 `src/components/ui/SaveStatus.tsx`,`ChecklistItemCard.tsx:54,292`、`AuditPad.tsx:136`、`ActionForm.tsx:581`
**改法**:**兩處死碼勾號**(非一處):ChecklistItemCard justSaved 設值但 JSX 從未渲染、AuditPad ScoreSection saveState 同樣 saved 分支死掉——填 87 題無從得知存沒存。**ActionForm 已有正確勾號**(是範本,非反例)。新元件 props `state:'idle'|'dirty'|'saving'|'saved'`:dirty=`w-1.5` 點(收斂 AuditPad 的 w-2 + 去掉 animate-pulse,pulse 偏玩具感政府宜克制)、saving=Spinner、saved=`<Check>` 綠 + 1.2s fade-out + `aria-live="polite"`。三個 inline 編輯器接上、啟用死掉的 saved。saved 微確認是 Linear/Notion 建立信任的 signature。

### 31. Dialog/Sheet/Toast 退場動畫 · [medium / M] · signature
**檔案**:`Dialog.tsx:82`、`Sheet.tsx:34`、`Toast.tsx:46`、`ChecklistItemCard.tsx:305,311`
**改法**:彈層只有進場無退場(硬切)。改 isMounted+isVisible 兩態,新增退場 keyframe(`fade-out`/`slide-down-out`/`slide-out-right`,timing 寫進 keyframe 字串因 `ease-emphasized-accel` 未暴露為 utility),`onAnimationEnd` 才 unmount。Toast remove 先標 `leaving` 套 `opacity-0 translate-y-1` 再 setTimeout 180ms filter(消除堆疊上跳)。ChecklistItemCard 展開只承諾 `animate-fade-in`(**height auto 無法純 CSS 過渡,不宣稱補高度動畫**),chevron 補 `duration-200 ease-standard`。**移除誇大**:Sidebar icon 已是 ease-standard 無需動。拆兩 PR(退場主菜 M / 進場補丁 S)。退場對稱性正是範本與 premium 的分水嶺。

### 32. CommandPalette 收編為系統門面 + listbox ARIA · [high / M] · signature
**檔案**:`CommandPalette.tsx:93,121`、`Dialog.tsx:101`
**改法**:全站最高頻 keyboard-first 介面卻是 token 孤島(`bg-white rounded-2xl shadow-xl border-neutral-200`)。**A 色彩對齊 Dialog**:容器 `bg-surface-container-high rounded-lg shadow-elev-5`、選中 `bg-primary-container text-on-primary-container`、底列/搜尋列 `border-outline-variant/60`、所有 neutral-* 換 on-surface-variant 階、overlay 對齊 Dialog scrim。**B listbox ARIA**:input `role="combobox" aria-activedescendant`,**單一 `<ul role="listbox">` 包全部**(目前每 group 一個 ul,多 listbox 會破壞 aria-controls,最易做錯點),項目 `role="option" aria-selected`。鍵盤邏輯不動(已是 roving 模式),只補語意。Raycast/Linear 等級該最精修的元件。

### 33. CommandPalette 覆蓋率補齊(sidebar 都能去)· [high / M] · baseline
**檔案**:`AppShell.tsx:33`、`Sidebar.tsx:32`
**改法**:palette 靜態手寫,SUPER_ADMIN 只列 3 項,sidebar 5 個額外目的地(organizations/admin cycles/checklists/posts/emails)+ /cycles 不可達,⌘K 半殘。把 Sidebar groups(已含 href/label/icon/allow)抽到 `src/lib/nav.tsx`,AppShell 用 `user.role` 過濾後 map 成 Command。**注意**:Sidebar icon size=20、palette size=16,共用時存 component reference 各自給 size(直接共用 baked size=20 會偏大);cycleId 情境指令維持 AppShell 單獨 append;善用既有但沒人用的 `keywords` 欄位加中英混搜。

### 34. reading-column measure(長文不橫拉 1280px)· [high / S] · signature
**檔案**:`deficiencies/[defId]/page.tsx:176,185`、`account/password/page.tsx:20`
**改法**:長文 Card 的 `<p>` 加 `max-w-prose`(65ch,比 max-w-3xl 更語意化、對 CJK 行寬更穩),只動 `<p>` 不動 Card 外框。密碼說明 `<p>` 加 `max-w-2xl` 與下方 max-w-md 表單對齊。**陷阱**:ActionForm 是 `lg:grid-cols-[220px_1fr]` 結構化表單,**千萬別包 max-w-3xl** 破壞兩欄。reading measure 是 Linear/Stripe/Notion 共同細節。

### 35. 委員審閱頁 sticky 篩選條 · [medium / S] · signature
**檔案**:`review/page.tsx:124`
**改法**:只把現有篩選列 div 改 sticky,沿用填報頁(ChecklistShell:276)同套 token:`sticky top-16 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4... py-3 bg-surface-container-lowest/95 backdrop-blur-sm border-b border-outline-variant/60`。FilterChipLink 本就 server-safe。**取此塊即拿 90% 價值,effort M→S**。**剔除**:回頂鈕、展開全部法規(需 client island/新互動,溢出「精修既有頁」+ 抵觸減法)。

### 36. 法規對照 details → 受控 Disclosure · [medium / M] · signature
**檔案**:6 處 native `<details>`(emails:196/review:214/ChecklistItemCard:316/AuditPad:204,397/ActionForm:50)
**改法**:抽 `Disclosure.tsx`,summary `[&::-webkit-details-marker]:hidden list-none` 自繪 lucide ChevronDown(`rotate-180 transition-transform duration-180→200`)+ `focus-ring`(取代 hover:underline),內容 `animate-fade-in`。保留各處 border/bg 語意色。法規對照是填報核心參照卻最廉價。**選配獨立判斷**:emails 內文改 Sheet(屬新互動,與本條切開)。

### 37. AuditPad/AspectSelect native input 換站上元件 · [medium / S] · baseline
**檔案**:`AuditPad.tsx:185,547`
**改法**:**校正:不套 filled 底線版** —— 站上 TextField/Select 是 h-14/h-12 filled,塞進 h-10 密集九列表格破壞密度且底線與外框打架。評分格只加 `[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`(殺原生 spinner);AspectSelect 加 `appearance-none` + inline 自繪 ChevronDown,保留現有 border-box token。核心是消滅原生箭頭/spinner 而非強制 filled。**S 非 M**。

### 38. checklist 填答動線去 Tabs 改線性堆疊 · [high / L] · signature
**檔案**:`ChecklistItemCard.tsx:143,311`
**改法**:三 Tab(填答/委員意見/紀錄佐證)預設停「填答」,但「紀錄佐證」藏第三分頁不切過去不知要傳檔,委員退回意見藏第二分頁。Tab 是互斥檢視語意,填報是循序步驟(符合度→說明→佐證)。移除 Tabs 改垂直堆疊:Segmented → 兩 Textarea → 直接接 EvidenceBlock(state 已 lift 到 parent,合併是機械搬移);委員意見 unresolved>0 時以 warning 卡置展開區最上方。法規對照 details 不動。Tabs 元件他處共用不刪,只此卡停用。同時減一次 Tabs 依賴=符合減法。

### 39. 統計卡層級拉開 + dashboard 進場 stagger · [medium / M] · signature
**檔案**:`StatTopBar.tsx:46`、`dashboard/page.tsx:213`
**改法**:**A 層級**:label `mt-0.5`→`mt-1` 拉開主數字;分數型加**選配** `denominator?` prop 弱化分母(`text-title-lg text-on-surface-variant`,**不在元件內 split('/')** 脆弱);圖示圓 `w-11`→`w-10`(兩頁共用一改兩益)。**不升 primary 到 headline**(政府偏大)。**B stagger**:四 section 加 `animate-slide-up` + inline `animationDelay`(hero 0/統計 50/雙欄 100/指引 150ms,政府宜克制)+ `motion-reduce:animate-none`(全 repo 零 motion-reduce,順手定為慣例)。token 已存在零引用。

### 40. NextStepBar 統一「下一步指引」signature · [medium / S] · signature
**檔案**:`cycles/[id]/page.tsx:135`、`dashboard/page.tsx:284`
**改法**:「系統告訴你下一步」是 process-guide 驅動的產品 signature 卻兩種長相(資料層 nextActionForRole 已共用,純差 markup)。抽 `NextStepBar`,鎖定 `bg-primary-50/40` + **左側 `border-l-[3px] border-primary-600` accent**(兩處目前都無,真正提升處)+ 標籤 `text-label-sm font-semibold text-primary-800 tracking-[0.06em]`。dashboard 用 `size="sm"`、cycles 用 `md`。**排除** deficiencies:202(danger 退回 callout,語義是「為何被退」非「下一步」)。

### 41. auth 卡抽 AuthShell(login/invite)· [medium / M] · baseline
**檔案**:新增 `AuthShell.tsx`,`login:55`/`invite:24`
**改法**:三套規格 → 對齊 login/invite 兩個真進場卡(invite 升:elev-1→2、rounded-md→lg、surface→surface-container-low、Logo 56→64、headline-sm→lg、ambient 統一 0.12/0.06)。**AuthShell 必須 server-safe**(純 presentational 無 hook,invite 是 server / login 是 client,login 把 client 表單當 children) —— 唯一技術風險。**PasswordForm 退出本主題**(它是 AppShell 內設定子頁,套 ambient hero 格格不入),只做 gap-4→gap-5。

### 42. 密碼頁即時規則 checklist + 強度條 · [medium / M] · signature
**檔案**:`account/password/page.tsx:20`、`PasswordForm.tsx:49`、`InviteAcceptForm.tsx:60`
**改法**:資安產品門面卻最樸素,輸入時零回饋。**順手修 baseline bug**:InviteAcceptForm 只擋 `length<8`、label「至少 8 字元」,與 `BASELINE.pwMinLength=12` 不一致。抽 `checkPassword(pw)` 純函式(放 security-baseline 旁,可 client 引用),新增 `PasswordRules.tsx`(達標 success-700 + Check、`ProgressBar` tone 隨 metCount,value 空時不渲染避免刺眼紅)。新密碼欄補顯示/隱藏切換(複用 login trailingIcon,login 有這裡沒有=不一致)。「不可與近三次相同/效期」屬伺服端不假裝可勾。

### 43. ActionForm window.confirm → ConfirmDialog · [medium / S] · signature
**檔案**:`ActionForm.tsx:165,594`
**改法**:同檔三處確認 UI,只有切換執行情形仍用瀏覽器灰框(刪除佐證/送出審核已用 ConfirmDialog 並註解「取代原生 window.confirm」)。加 `pendingExec` state,losing>0 才彈,第三個 ConfirmDialog `tone="warning"`(danger 留刪除),setExecStatus+touch 移到 onConfirm 內(否則 radio 先切換)。

### 44. scores 熱圖補色階圖例 + 標最弱面向 · [medium / M] · signature
**檔案**:`scores/page.tsx:66,119,132`
**改法**:色塊有色義但無 legend(使用者猜),colAvg 已算全院各構面平均但最弱格零強調=把洞察藏起來(這正是此頁存在理由)。**校正:5 格離散等第**(非 4 色連續、非分數區間,gradeOf cutoff 因構面而異)legend 標等第文字(優/良/佳/可/待改進,複用 TONE_BG 5 鍵)。tfoot 最弱構面 td 加 `ring-1 ring-inset ring-danger-400 font-semibold` + title。**不做**逐列描邊(視覺過載+違減法)。

### 45. 長表單 sticky action bar(僅 ActionForm)· [medium / M] · signature
**檔案**:`ActionForm.tsx:569`
**改法**:dirty/autosave/送出 CTA 在 Card 最底,表單破窗後看不到「未儲存」警示。**校正:`-mx-6` 算術前提錯** —— 動作列埋在 `grid-cols-[220px_1fr]` 右欄,套 -mx-6 不對齊 Card 內距。需把動作列**提到 grid 外**作 Card 直接子層再 `sticky bottom-0 -mx-6 px-6 py-3 bg-surface-container-low/95 backdrop-blur border-t`。**PostEditor 移除本條**(無 dirty/autosave,強塞=替公告新增整套 autosave=淨新功能踩減法邊界)。dirty/saved span 原樣搬入。

### 46. 前後台頂欄 glass 統一 + scrolled 才上浮 · [low / S] · signature
**檔案**:`PortalHeader.tsx:13`、`TopStrip.tsx:24`
**改法**:兩者統一 `bg-surface-container-low/90 backdrop-blur-md border-b border-outline-variant/60`(PortalHeader surface→container-low、TopStrip 95→90、blur 取 md)。**只給 TopStrip 加 scrolled elevation**(PortalHeader 是 server component 不能監聽捲動,保持靜態):未捲 `border-transparent shadow-none`、已捲 `border-outline-variant/60 shadow-elev-1`,passive listener + mount 讀初值 + rAF 節流。Linear/Vercel 靜止乾淨、捲動才上浮。

### 47. Button/Card 一致微抬升 hover · [low / S] · signature
**檔案**:`Button.tsx:47`、`Card.tsx:31`
**改法**:filled/elevated Button 加 `hover:-translate-y-px`(配既有 hover:shadow-elev-2),Card elevated+interactive 分支加 `hover:-translate-y-px`(僅 interactive 為真時)。tonal/outlined 不抬(無 elevation 依據)。完成 hover 微浮(-1px)→ press 微沉(scale 0.985)連續曲線。幅度 1px 符合「小不花俏」。globals.css 已有 reduced-motion 自動失效。

### 48. landing hero 輪播改 Ken Burns + 信任徽記升級 · [medium / M→S] · signature
**檔案**:`page.tsx:118,163`
**改法**:**採減法版**(主次對調) —— 6 張 36s 輪播 + 每次 server render `Math.random` 洗牌讓品牌首屏不穩。砍輪播只留 1 張固定照 + 18-20s `motion-safe:animate-[kenburns...]`(同治「洗牌不穩」「看不出進度」,純減法 effort M→S)。**不採**加 progress dots/pause(把互動加回來=臃腫)。信任徽記:裸 Check 包成容器,**用 primary 環非 success 綠**(藍 hero 塞綠蓋章不一致),複用 Feature 既有 `ring-primary` 語彙。

### 49. 列印觸發鍵走 Button + 報告 CJK 字體統一 · [medium / M] · baseline
**檔案**:`PrintTrigger.tsx:5`、`AuditMergeTool.tsx:620`、6 處 CJK fallback
**改法**:PrintTrigger(裸 hex + 🖨️ emoji + 方角)→ `<Button variant="filled" size="sm" leadingIcon={<Printer/>}>`;audit-merge .btn-primary 同。CJK fallback 兩套並存(BiauKai vs KaiU)同一份公文橫跨兩標楷:統一 `--font-report-serif: 'Times New Roman','標楷體','KaiU','BiauKai','DFKai-SB',serif`,六處引用(保留 KaiU 主、BiauKai 次選 alias)。

### 50. audit-merge 警告升級為「跳到該發現」回鏈 · [medium / M] · signature
**檔案**:`AuditMergeTool.tsx:106,290`
**改法**:collectWarnings 丟純文字,但「跳轉+highlight+scrollIntoView」機制已完整存在(`preview-target-${id}`)沒接上。改回傳 `{message, target:{tab,focusId}}[]`(**留白發現目前是聚合布林 hasEmptyFinding,須改逐筆蒐集 id** —— 這是低估的真工作量),ConfirmDialog 每條改 `<button onClick={切tab+handleSetFocus+關彈窗}>`。Linear jump-to-issue 心智模型。

### 51. 報告螢幕預覽改「紙張容器」+ 工具列層級 · [medium / M] · signature
**檔案**:`audit/report/page.tsx:121,59`、`assembled-report.css:9`
**改法**:**A(confirmed)**:封面寫死 `minHeight:225mm` 開頁即整螢幕空白,內文 edge-to-edge。AssembledReport 外包 `max-w-[210mm] bg-white shadow-elev-1`、page 外層 bg-white→`bg-surface-container-low`(白紙浮起景深)、`@media screen` 把 225mm 降 auto。**B(描述錯,部分 reject)**:Convert/Finish 其實已是 filled(Button 預設),非「4 顆同權重」。唯一小精修:列印 tonal→`outlined`,讓一行 1 filled + 1 tonal + 1 outlined 遞減。不加下拉選單。

### 52. 行內次要操作列 hover 漸顯 · [low / S] · signature
**檔案**:`posts/page.tsx:88`、`organizations/page.tsx:87`
**改法**:**僅限純導覽連結兩處**:tr 補 `group`,連結 `text-on-surface-variant group-hover:text-primary-700 transition-colors`(移除 hover:underline),orgs 保留 ChevronRight 作持續 affordance,觸控 `[@media(hover:none)]:text-primary-700`。**users:141 不動**(是破壞性 Button「改角色/停用」非導覽連結,hover 才現傷可發現性——原建議誤判)。

### 53. 把「像 Chip 又不是 Chip」改回 Chip + 前台頂欄 active + landing token 等小簽名 · [low / S] · 混合
**檔案**:`audit/report/page.tsx:96`、`PortalHeader.tsx:18`、`Logo.tsx:26`、+ landing token signature、news markdown CJK、raw px→rem→token、section spacing rhythm、workflow card depth、disabled tooltip、admin header action hierarchy
**改法**(同類小簽名合併一批機械處理):
- 委員進度膠囊改 `<Chip>` 但**保留名稱/metadata 明暗對比**(名稱 `font-semibold text-on-surface`,勿被 Chip 單一 tone 抹平)。
- PortalHeader 改 client 補 active 指示(複用 page.tsx:265 既有 after: 底線 token,勿發明新樣式)。
- Logo wordmark `text-neutral-900/500` → `text-on-surface/-variant`、字級 `text-[0.9375rem]`→`text-title`、`text-[0.6875rem]`→`text-label-sm`(**保留 tracking-tight 緊排**)。**駁回 SVG/srcset**(413px 來源在 ≤64px 用例都是降採樣,銳利,解不存在的問題)。
- landing 陰影/漸層/Button lg(已在快贏 #12)。
- news markdown:`em{font-style:normal}`(CJK 不合成斜體鐵律)、blockquote 加 `bg-surface-container-low`、外連補圖示(僅 http(s))。
- spacing 節奏:p-7→p-6 全站(login/invite/landing,回 8 刻度,零風險優先);gap-4→gap-5 統一統計卡;section 逐頁 mb-8(**勿一次切 AppShell space-y-8** 會與既有 mb-* 雙疊加 64px)。
- 工作流卡景深:PrepBoard/deficiencies 顯式 `variant="outlined"`(**校正:deficiencies 現況是 elevated 非 outlined**,主題誤讀),陰影回歸 dialog/sheet/FAB。
- 禁用態:ChecklistShell 假禁用 opacity-40 → Button 原生 disabled;cycles 匯出鈕 `<span title>` → Tooltip(**不動 tonal/text 主次階層**)。
- 文字孤兒值:CycleStepper/scores `text-[10px]`→`text-label-sm`、Chip xs `text-[0.6875rem]`→`text-label-sm`。

---

## 刻意不做(減法守則)

以下四項經對抗式驗證後**剔除**,因抵觸減法鐵律或前提不成立:
- **頁標題/CardTitle 雙標準收斂**:原建議「CardTitle 改 title-lg」會膨脹數十個小工具卡標題,方向錯誤。
- **雙層 sticky 工具列遮蔽修正**:其中「構面跳轉被遮」基於死碼 `scroll-mt-40`(假前提),「審閱頁篩選改 sticky」是淨新 sticky 層。
- **Sidebar rail 收合**:啟用死碼=加回被砍的複雜度,反向應刪碼。
- **抽 DescriptionList**:全站僅 ActionForm 一處真 dl,抽元件無法統一散文式副標。

---

## 建議執行順序

**第一批(8 項,2–3 天可全站見效,零/極低風險)**——先收「平行系統洩漏」與「狀態誤導」兩個系統性差距的最高槓桿點:

1. **#1 tone 單一來源(段1+2)** —— 修真 bug(角色跨頁變色),為 #17/#18/#19/#44 的 tone 收斂鋪路。
2. **#5 日期統一民國年** —— 同表兩套日曆制度直接傷政府場域可信度,純機械替換。
3. **#6 空狀態文案 + dashboard 死路** —— 「稽核頁印『尚無紀錄』誤導計中」+「能開週期的人被叫等別人」是兩個觀感與邏輯硬傷。
4. **#13 not-found/error/global-error** —— 上線前唯一還會露出英文白頁的破口,政府/醫療不可接受。
5. **#3 + #11 Skeleton 用對色 + scrim/duration-180 收 token** —— 後者修「過渡實際 0s 未生效」的隱性 bug,一併清。
6. **#9 麵包屑壞鏈 + #8 skip link** —— 修 AUDITOR 被靜默彈回 + WCAG 2.4.1 基礎缺口。
7. **#2 tabular-nums(Chip base)** —— 一行改動全站數字等寬。
8. **#10 觸控 44px + login 眼睛鈕鍵盤可達** —— 後者是真 a11y bug。

**為什麼這 8 項先做**:全是 effort S、改 token/共用元件即全站見效、且每項都修「實際 bug 或政府場域硬傷」而非純美學——第一批落地後,產品在「可信度/狀態完整性/一致性」三軸立刻脫離範本級,且為第二批的元件抽取(DataTable/PageHeader/Alert/SaveStatus)清掉前置依賴。

**第二批**:#14 DataTable → #16 PageHeader → #18+#19 Alert(合併)→ #20 errorText → #24 a11y hook —— 五個結構性元件抽取,是後續 sticky/排序/表單驗證/退場動畫的載體。

**第三批**:#29 NavProgress / #30 SaveStatus / #31 退場動畫 / #32 CommandPalette —— 四個讓「感知效能」與「鍵盤門面」到位的 signature,做完即達 Linear/Stripe 觸感的及格線。

---

## 整體還差什麼才到 Linear/Stripe 等級

材料齊、施工紀律補完後,離頂級**還差「系統性的動態語言」**——目前每個動態都是逐處決定(這裡 fade、那裡硬切),Linear/Stripe 的招牌是**整個產品共用一套可預測的進出場/狀態轉換語法**(同一 easing 曲線、同一 stagger 節奏、退場必對稱、列表增刪有 FLIP 位移),讓介面感覺「活的、連續的、可信賴的」。把 #29–#32、#39 收斂成一份明文的 motion spec 並全站貫徹,才是從「精修良好的 SaaS」跨到「signature 級 SaaS」的最後一哩。
