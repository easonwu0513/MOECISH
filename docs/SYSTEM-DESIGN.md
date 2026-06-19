# MOECISH 2.0 系統設計書

教育部醫療領域資通安全稽核管考平台 — 完整重設計

> 版本:v2.0 草案 / 2026-06-10
> 依據:user 需求(2026-06-10)+ 115年國立臺灣大學矯正措施報告 Excel 範本 + 現行 MOECISH 1.0 codebase
> 狀態:**待核定** — 開放問題見 §10

---

## 1. 產品定位與資訊架構

兩層式系統,單一 Next.js 應用承載:

```
┌─────────────────────────────────────────────────┐
│  前台 Portal(公開,不需登入)                      │
│  「醫療領域資安資訊入口」                          │
│  - Landing(品牌 hero + 統計 + 最新公告)           │
│  - 資安資訊(公告/情資/漏洞警訊/活動)列表+內頁       │
│  - 登入入口                                       │
├─────────────────────────────────────────────────┤
│  後台 稽核管考系統(登入後,角色分流)                │
│  - 稽核週期生命週期管理                            │
│  - 稽核前資料準備(受稽單位上傳)                    │
│  - 缺失發布 → 矯正填報 → 委員審查 → 結案            │
│  - 追蹤通知(Graph 寄信)                           │
│  - 儀表板 / 報表 / 匯出                            │
│  - 系統管理(機關/帳號/公告 CMS)                    │
└─────────────────────────────────────────────────┘
```

對標 H-ISAC(hisac.nat.gov.tw)會員入口的概念,但設計品質目標:政府網站的信任感 × Linear/Notion 級的現代感。沿用 MOECISH 1.0 已建立的深海軍藍設計系統(NTU ISMS 風格、M3 元件、Inter + Noto Sans TC)。

---

## 2. 角色與權限(RBAC)

角色由 4 個簡化為 **3 個**:

| 角色 | 代號 | 對象 | 核心權限 |
|---|---|---|---|
| 最高管理員 | `SUPER_ADMIN` | 資安推動中心 | 全部:機關/帳號管理、公告 CMS、開週期、發布缺失、寄追蹤信、看全部儀表板、匯出 |
| 機關管理員 | `ORG_ADMIN` | 各醫院資安窗口 | 限自家機關:上傳稽核前資料、填報矯正措施、上傳佐證、上傳用印掃描檔、看自家進度 |
| 稽核委員 | `AUDITOR` | 外聘/內聘委員 | 被指派的週期:檢視準備資料並確認/標缺件、審查矯正措施(通過/退回) |

### 1.0 → 2.0 角色遷移

| 1.0 | 2.0 | 處理 |
|---|---|---|
| ADMIN | SUPER_ADMIN | 改名 |
| AUDITOR | AUDITOR | 不變 |
| RESPONDENT | ORG_ADMIN | 合併 |
| SUPERVISOR | ORG_ADMIN | 合併;原「主管線上簽核」改為「線下用印 + 掃描上傳」(對齊現行實務:範本 footer 即「承辦人/單位主管」欄,實務上印出用印再掃描) |

權限實作:沿用 `src/lib/rbac.ts` 模式,middleware 統一驗 role + organizationId 範圍。ORG_ADMIN 所有查詢強制 `where organizationId = session.user.organizationId`(防水平越權)。

---

## 3. 稽核週期生命週期(狀態機)

一個 `AuditCycle` = 一個機關 × 一個年度的完整稽核案。

```
DRAFT ──開放準備──▶ PREPARATION ──資料齊備──▶ READY ──實地稽核日──▶ ONSITE
                        │                                            │
                        │(委員標缺件 ⟲ 補件)                          ▼
CLOSED ◀──全數通過+簽章◀── REVIEWING ◀──提交──── REMEDIATION ◀──發布缺失── REPORT_ISSUED
              ▲                │
              │                │ 退回(整輪或單項)
              └── 多輪循環 ◀────┘
```

| 狀態 | 誰在動作 | 動作 |
|---|---|---|
| DRAFT | SUPER_ADMIN | 建立週期、掛資料準備需求清單、指派委員 |
| PREPARATION | ORG_ADMIN | 上傳稽核表 + 稽核資料(功能5) |
| READY | AUDITOR | 檢視資料,全部「已確認」即齊備 |
| ONSITE | (線下) | 實地稽核;系統僅記錄日期 |
| REPORT_ISSUED | SUPER_ADMIN | 發布缺失清單(手動建立或 Excel 匯入) |
| REMEDIATION | ORG_ADMIN | 逐項填矯正措施 + 佐證,完成後提交 |
| REVIEWING | AUDITOR | 逐項審查:通過 / 退回(附理由) |
| CLOSED | SUPER_ADMIN | 全數通過 + 用印掃描檔上傳後結案 |

- 退回項目回到 REMEDIATION,輪次 `round + 1`,歷程完整保留(對齊真實案例:0417、0507 多輪掃描檔)。
- 每個狀態轉換寫入 `CycleStateTransition`(沿用 1.0)+ `AuditLog`。

---

## 4. 模組設計

### 模組 A:前台 Portal + 公告 CMS

**前台頁面(公開)**

| 路由 | 內容 |
|---|---|
| `/` | Landing:① hero(平台名 + 一句定位 + 登入 CTA + 柔和漸層/盾牌視覺) ② 平台數字(服務醫院數、年度稽核場次、矯正完成率) ③ 最新公告 6 則卡片 ④ 資安情資精選 ⑤ 流程簡介(準備→稽核→矯正→結案 四步圖) ⑥ footer(主辦單位、聯絡信箱、版權) |
| `/news` | 公告列表:分類 tab(全部/平台公告/資安情資/漏洞警訊/活動訊息)+ 搜尋 + 分頁 |
| `/news/[slug]` | 公告內頁:標題、日期、分類 chip、Markdown 內文、附件下載 |
| `/login` | 登入(沿用現有,視覺升級為 portal 一致) |

**CMS 後台(SUPER_ADMIN)**

- `/admin/posts`:列表(狀態:草稿/已發布/已下架,置頂排序)
- 編輯器:標題、分類、Markdown 內文、封面圖(選用)、附件、發布時間(可排程)、置頂開關
- 公告可標「重要」→ 前台紅色 alert 樣式 + landing 置頂

**設計原則**:白底大量留白、卡片陰影 elev-1、公告分類用既有 Chip 色票(primary/sage/warning/danger 對應四分類)、不用照片改用幾何/漸層裝飾 — 比 H-ISAC 的表格式列表高一個世代。

### 模組 B:稽核前資料準備(功能 5)

**流程**:SUPER_ADMIN 定義需求 → ORG_ADMIN 上傳 → AUDITOR 確認。

- **需求清單範本**(`PrepTemplate` + `PrepRequirement`):可複用(例:「115年度實地稽核標準清單」= 稽核表、資安維護計畫、ISMS 驗證證書、上年度改善報告、資產清冊...)。開週期時套範本,可再增刪。
- **ORG_ADMIN 上傳**(`PrepSubmission`):每需求項可傳多檔 + 備註;進度條「已上傳 8/12」;可重傳(保留版本)。
- **AUDITOR 檢視**:逐項標 ✅已確認 / ⚠️缺件(附理由)。缺件 → 自動寄信通知 ORG_ADMIN(模組 D)。
- **齊備判定**:全部需求項=已確認 → 週期可進 READY,委員列表顯示「資料齊全 ✓」。
- SUPER_ADMIN 儀表板:全機關準備度矩陣(機關 × 完成率 × 缺件數)。

### 模組 C:缺失發布與矯正管考(功能 2+3)— 核心模組

**資料結構完全對齊 Excel 範本**(115年NTU改善報告):

```
Deficiency(缺失)
├ 構面 aspect:STRATEGY(策略面)/ MANAGEMENT(管理面)/ TECHNICAL(技術面)
├ 類型 type:IMPROVE(待改善事項)/ SUGGEST(建議事項)
├ 項次 itemNo(構面×類型內排序)
├ 描述 description(含法源引用 + 查核發現)
├ 檢核項參照 checklistRef(如 "9.10")
└ CorrectiveAction(矯正措施,1:1,多輪)
   ├ 根因分析 rootCause
   ├ 改善措施(可複選,三類各附說明文字):
   │   measureStrategy?: string(策略面調整說明)
   │   measureManagement?: string(管理面調整說明)
   │   measureTechnical?: string(技術面調整說明)
   ├ 預計完成時程 plannedDate
   ├ 進度追蹤方式 trackingMethod
   ├ 執行情形 execStatus:ON_TIME_DONE(如期完成)/ IN_PROGRESS(未逾期辦理中)
   │            / LATE_DONE(逾期完成)/ LATE_IN_PROGRESS(逾期辦理中)
   ├ 實際完成日 actualDate? / 延長至 extendedDate? / 原因 delayReason?
   ├ 佐證 Evidence[](多檔)
   ├ 狀態 status:PENDING(待填報)→ SUBMITTED(已提交)→ PASSED(通過)/ RETURNED(退回)
   └ ReviewRecord[](委員審查歷程:round、decision、comment、審查人、時間)
```

**SUPER_ADMIN 發布缺失**,兩種方式:
1. 表單逐筆建立(構面/類型/描述/檢核項)
2. **Excel 匯入** — 直接吃教育部範本格式(解析三構面區塊、待改善/建議分節、項次與描述),匯入預覽確認後寫入

**ORG_ADMIN 填報介面**:
- 缺失卡片列表(構面分組、狀態 chip、輪次標記)
- 單項填報頁:左側缺失原文(唯讀)、右側表單(根因/三類措施 checkbox+文字/時程/追蹤方式/執行情形 radio + 條件欄位)
- 佐證上傳(型別白名單 pdf/docx/xlsx/png/jpg/zip,單檔 ≤20MB,SHA-256 已有)
- 草稿自動儲存;全部填妥 → 「提交送審」

**AUDITOR 審查介面**:
- 待審清單(被指派週期)
- 對照檢視:缺失 + 機關填報 + 佐證預覽 → 決定:✅通過 / ↩退回(必填理由)
- 退回單項即可(不必整批),ORG_ADMIN 只重填退回項

**簽章與結案**(對齊現行「列印→用印→掃描」實務):
- 全數通過後,系統產出 **Word/Excel 報告(版式 = 教育部範本)**
- ORG_ADMIN 線下用印 → 掃描上傳(`SignedReport`)
- SUPER_ADMIN 確認掃描檔 → 結案 CLOSED

### 模組 D:追蹤通知(功能 4)

寄信通道:`moecish@m365.ntu.edu.tw` via Microsoft Graph delegated(已驗證可用,見 azure-ad-moecish-app memory)。

**手動寄信**:SUPER_ADMIN 選機關(可多選)→ 套範本 → 寄送;支援變數(機關名、截止日、未完成清單、登入連結)。

**自動規則**(系統排程,node-cron 或 systemd timer):

| 觸發 | 對象 | 時點 |
|---|---|---|
| 資料準備缺件 | ORG_ADMIN | 委員標缺件當下 |
| 矯正退回 | ORG_ADMIN | 委員退回當下 |
| 預計完成日將至 | ORG_ADMIN | D-7、D-1 |
| 逾期未完成 | ORG_ADMIN(+SUPER_ADMIN 副本) | 逾期日、之後每 14 天 |
| 季度追蹤 | 所有未結案機關 | 可設定(如每季首日)— 對齊 0417/0507 實務節奏 |

- 信件範本管理(`EmailTemplate`):主旨/內文(變數插值)/啟用開關
- 全部寄送進 `EmailLog`(已有),管理介面可查歷史
- 寄送失敗進重試佇列(參考 ISMS pending_notifications 模式,簡化版)

### 模組 E:儀表板與報表

| 角色 | 首頁儀表板 |
|---|---|
| SUPER_ADMIN | 全機關矩陣:每機關 × (準備度/缺失數/已通過/逾期紅燈);構面缺失分布圖;矯正完成率趨勢 |
| ORG_ADMIN | 我的待辦:待上傳資料 n 項、待填報缺失 n 項、被退回 n 項(紅)、即將到期 n 項(黃) |
| AUDITOR | 待審:資料待確認 n、矯正待審 n;我的審查歷程 |

**匯出**:
1. 單機關改善報告(Word + Excel,版式對齊教育部範本)— 給機關用印
2. 全機關彙整表(Excel)— SUPER_ADMIN 給長官/教育部回報
3. 缺失統計(構面 × 類型 × 狀態 樞紐)

---

## 5. 資料模型(Prisma schema 2.0)

```prisma
// ===== 帳號與機關(調整) =====
model User {
  id             String   @id @default(cuid())
  email          String   @unique
  name           String
  passwordHash   String
  role           String   // SUPER_ADMIN | ORG_ADMIN | AUDITOR
  organizationId String?  // ORG_ADMIN 必填
  organization   Organization? @relation(...)
  isActive       Boolean  @default(true)
  lastLoginAt    DateTime?
  ...
}

model Organization { ... }       // 沿用(醫院)
model Invitation { ... }         // 沿用(邀請制開帳號)

// ===== 前台公告(新) =====
model Post {
  id          String    @id @default(cuid())
  slug        String    @unique
  category    String    // ANNOUNCEMENT | INTEL | VULN_ALERT | EVENT
  title       String
  contentMd   String    // Markdown
  coverKey    String?   // 封面圖 storage key
  important   Boolean   @default(false)
  pinned      Boolean   @default(false)
  status      String    @default("DRAFT") // DRAFT | PUBLISHED | ARCHIVED
  publishedAt DateTime?
  authorId    String
  attachments PostAttachment[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@index([status, category, publishedAt])
}
model PostAttachment { id, postId, fileName, storageKey, sizeBytes, mimeType }

// ===== 稽核週期(調整) =====
model AuditCycle {
  id             String @id @default(cuid())
  year           Int
  organizationId String
  status         String @default("DRAFT")
  // DRAFT|PREPARATION|READY|ONSITE|REPORT_ISSUED|REMEDIATION|REVIEWING|CLOSED
  onsiteDate     DateTime?
  prepDueDate    DateTime?   // 資料準備截止
  remedDueDate   DateTime?   // 矯正填報截止
  closedAt       DateTime?
  assignments    AuditorAssignment[]   // 沿用
  transitions    CycleStateTransition[] // 沿用
  prepRequirements PrepRequirement[]
  deficiencies   Deficiency[]
  signedReports  SignedReport[]
  @@unique([organizationId, year])
}

// ===== 模組 B:資料準備(新) =====
model PrepTemplate {
  id    String @id @default(cuid())
  name  String              // "115年度實地稽核標準清單"
  items PrepTemplateItem[]
}
model PrepTemplateItem { id, templateId, title, description?, required, orderIndex }

model PrepRequirement {     // 套到週期後的實例
  id          String @id @default(cuid())
  cycleId     String
  title       String        // "資通安全稽核表"
  description String?
  required    Boolean @default(true)
  orderIndex  Int
  submission  PrepSubmission?
}
model PrepSubmission {
  id            String @id @default(cuid())
  requirementId String @unique
  status        String @default("EMPTY") // EMPTY|UPLOADED|CONFIRMED|INSUFFICIENT
  note          String?       // 機關備註
  reviewNote    String?       // 委員缺件理由
  reviewedById  String?
  reviewedAt    DateTime?
  files         Evidence[]    // 多檔(Evidence 多型沿用)
  updatedAt     DateTime @updatedAt
}

// ===== 模組 C:缺失與矯正(重構自 Finding/Remediation) =====
model Deficiency {
  id           String @id @default(cuid())
  cycleId      String
  aspect       String   // STRATEGY | MANAGEMENT | TECHNICAL
  type         String   // IMPROVE(待改善) | SUGGEST(建議)
  itemNo       Int      // 構面×類型內項次
  description  String   // 缺失全文(含法源)
  checklistRef String?  // "9.10"
  action       CorrectiveAction?
  createdById  String
  createdAt    DateTime @default(now())
  @@unique([cycleId, aspect, type, itemNo])
}

model CorrectiveAction {
  id                String @id @default(cuid())
  deficiencyId      String @unique
  status            String @default("PENDING")
  // PENDING|DRAFT|SUBMITTED|RETURNED|PASSED
  round             Int    @default(1)
  rootCause         String?
  measureStrategy   String?   // 策略面調整說明(null = 未勾)
  measureManagement String?   // 管理面調整說明
  measureTechnical  String?   // 技術面調整說明
  plannedDate       DateTime?
  trackingMethod    String?
  execStatus        String?   // ON_TIME_DONE|IN_PROGRESS|LATE_DONE|LATE_IN_PROGRESS
  actualDate        DateTime?
  extendedDate      DateTime?
  delayReason       String?
  submittedAt       DateTime?
  evidences         Evidence[]  // 多型
  reviews           ReviewRecord[]
  updatedAt         DateTime @updatedAt
}

model ReviewRecord {
  id        String @id @default(cuid())
  actionId  String
  round     Int
  decision  String   // PASS | RETURN
  comment   String?
  auditorId String
  decidedAt DateTime @default(now())
  @@index([actionId, round])
}

model SignedReport {        // 用印掃描檔
  id         String @id @default(cuid())
  cycleId    String
  fileKey    String
  fileName   String
  sha256     String
  uploadedById String
  uploadedAt DateTime @default(now())
  confirmedById String?    // SUPER_ADMIN 確認
  confirmedAt DateTime?
}

// ===== 模組 D:通知(新增範本) =====
model EmailTemplate {
  id      String @id @default(cuid())
  key     String @unique  // prep-insufficient | action-returned | due-soon | overdue | quarterly
  subject String
  bodyMd  String           // 支援 {{orgName}} {{dueDate}} {{items}} {{loginUrl}}
  enabled Boolean @default(true)
}
model EmailLog { ... }      // 沿用,加 templateKey?

// ===== 共用(沿用) =====
model Evidence { ... targetType 增加 PREP_SUBMISSION | CORRECTIVE_ACTION }
model AuditLog { ... }      // 強化:所有寫入操作都記
model AuditorAssignment { ... }
model CycleStateTransition { ... }
```

**1.0 → 2.0 遷移**:`ChecklistVersion/ChecklistItem/ChecklistResponse/AuditorComment` 保留不動(見開放問題 Q1);`Finding/Remediation/ReviewDecision/Signature` 以新模型取代(現庫只有 demo 資料,直接重建即可,不需資料搬遷)。

---

## 6. 頁面路由地圖

```
前台(公開)
├ /                    Landing
├ /news                公告列表(?category=)
├ /news/[slug]         公告內頁
└ /login               登入

後台(登入)
├ /dashboard           角色分流儀表板
├ /cycles              週期列表(角色過濾)
├ /cycles/[id]         週期總覽(狀態時間軸 — 沿用 Timeline 元件)
│ ├ /prep              資料準備(ORG_ADMIN 上傳 / AUDITOR 確認)
│ ├ /deficiencies      缺失清單(構面分組)
│ │ └ /[defId]         單項:填報(ORG_ADMIN)/ 審查(AUDITOR)
│ ├ /report            報告產出 + 用印掃描上傳 + 結案
│ └ /export            匯出(Word/Excel)
├ /admin(SUPER_ADMIN)
│ ├ /organizations     機關管理(沿用)
│ ├ /users             帳號 + 邀請(沿用)
│ ├ /cycles            開週期 + 套需求範本 + 指派委員
│ ├ /deficiencies      缺失發布(表單 + Excel 匯入)
│ ├ /prep-templates    需求清單範本
│ ├ /posts             公告 CMS
│ ├ /emails            寄信(手動 + 範本 + 紀錄)
│ └ /tracking          自動追蹤規則設定
└ /me                  個人設定(改密碼)
```

---

## 7. 既有程式碼處置

| 資產 | 處置 |
|---|---|
| 設計系統(`components/ui/**`、tokens、icons) | **全保留** — 2.0 的底 |
| AppShell/Sidebar/Breadcrumbs | 保留,選單依新路由改 |
| NextAuth + rbac.ts | 保留,role 改 3 值 |
| Organization/Invitation/EmailLog/AuditLog/Evidence | 保留(小調整) |
| AuditCycle + Timeline | 保留,狀態機擴充 |
| **檢核表模組**(83 題填報) | **待決**(Q1):建議降為「選用功能」保留 code,2.0 預設不在選單 |
| Finding/Remediation 模組 | 重構為 Deficiency/CorrectiveAction(UI 可大量重用 FindingForm/RemediationEditor) |
| Signature(線上簽名) | 棄用,改 SignedReport 掃描上傳 |
| email.ts(假寄信) | 接上 Graph delegated(介面不變,callers 零改動) |
| docx/exceljs 匯出 | 重寫版式對齊教育部範本 |

---

## 8. 補齊建議(我幫你想的)

1. **稽核行程管理**:週期上記實地稽核日 + 委員指派(已有 AuditorAssignment),SUPER_ADMIN 一頁看全年稽核行事曆。
2. **逾期升級策略**:D-7 提醒 → D-1 提醒 → 逾期當天通知機關+副本最高管理員 → 每 14 天追擊,語氣遞進(範本分級)。
3. **歷年歸檔與跨年比較**:結案週期進歸檔庫;新年度開週期時可一鍵帶入「上年度未結案缺失」,委員審查時可看「該機關歷年同類缺失」 — 抓「年年都犯」的累犯項目,這是稽核管考真正的價值。
4. **稽核軌跡全覆蓋**:這是稽核系統,自己要禁得起稽核 — 所有寫入(填報/審查/狀態轉換/寄信/登入)進 AuditLog,SUPER_ADMIN 可查可匯出。
5. **附件治理**:型別白名單、20MB 上限、SHA-256(已有欄位)、檔名保留原名 + storage key 隔離;掃毒可後補(ClamAV)。
6. **統計圖表**:構面 × 類型缺失分布(長條)、機關矯正完成率(排行)、逾期趨勢(折線)— 給長官看的那頁。
7. **彙整匯出**:一鍵產出「全機關改善情形彙整表」Excel,直接拿去跟教育部回報。
8. **資料保留政策**:稽核資料保存年限設定(政府慣例 5-10 年),到期封存提示。
9. **委員迴避**:委員不得審查自己服務機關的週期(指派時系統擋)。
10. **RWD**:委員實地稽核時用平板看資料準備清單 — 後台關鍵頁面(prep、審查)做平板適配。
11. **前台 SEO/無障礙**:OG tags、語意化標籤、鍵盤可達 — 政府網站無障礙規範 AA 等級為目標。
12. **登入安全**:密碼複雜度、連續失敗鎖定(5 次/15 分)、密碼重設信(走同一個 Graph 寄信)。

---

## 9. 分期實作計畫

| Phase | 內容 | 為什麼先做 |
|---|---|---|
| **P1 核心矯正流程** | 角色簡化 3 個 + 模組 C(缺失發布/Excel 匯入/填報/審查/多輪)+ 佐證上傳 + 基本儀表板 | 這是平台存在的理由;Excel 範本已給,規格最明確 |
| **P2 資料準備 + 真寄信** | 模組 B(需求清單/上傳/委員確認)+ email.ts 接 Graph + 模組 D 手動寄信 | 功能 5 + 功能 4 前半 |
| **P3 前台 Portal** | 模組 A(landing/公告/CMS)+ 視覺打磨 | 對外門面,等內核穩了再開門 |
| **P4 自動化 + 報表** | 自動追蹤規則 + 匯出(範本版式 Word/Excel)+ 統計圖表 + 歸檔 | 錦上添花,依賴前三期資料 |

每期結束都可部署到 MOECISH VM 驗收(已建立的部署管線直接複用)。

---

## 10. 開放問題(請拍板)

| # | 問題 | 我的建議 |
|---|---|---|
| Q1 | 既有 83 題檢核表線上填報模組,2.0 要保留嗎?(功能 5 是「上傳稽核表檔案」,跟線上填報重疊) | 保留 code 但預設隱藏 — UAT 先用檔案上傳(符合現行實務),未來想線上填再開 |
| Q2 | 前台要公開於網際網路嗎?(影響 NTU prod Caddy 設定與資安審查範圍) | 公開(否則 portal 無意義),但 UAT 期可先鎖校內+醫院 IP |
| Q3 | 用印流程:維持「線下用印+掃描上傳」? | 是 — 對齊現行實務,電子簽章法遵成本高,留待未來 |
| Q4 | Excel 匯入格式鎖定這份教育部範本? | 是,但解析器寫寬鬆(容忍欄位順序/併儲存格差異),範本變了只改 parser |
| Q5 | 機關之間要不要分層(如 大學→附醫)? | 暫不分層,Organization 平面 10 間;schema 已有 parentId 欄位留未來 |
| Q6 | 季度追蹤的節奏(0417/0507 那種)由 SUPER_ADMIN 手動觸發還是全自動? | 半自動:系統到期提示 SUPER_ADMIN,一鍵確認後寄出(政府文化:人要看過再發) |

---

*本設計書由 MOECISH 1.0 codebase + 教育部 115 年範本逆向而來,Phase 1 動工前請先核定開放問題。*
