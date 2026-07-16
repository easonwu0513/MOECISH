# 觀察員(OBSERVER)身分設計書

> 2026-07-07 起草。對應需求:一、觀察員權限定義;二、實習與指導機制(師徒制);三、多重身分與晉升。
> 現況基線:prod `ab4e939`(批29);角色三元 SUPER_ADMIN / ORG_ADMIN / AUDITOR。

---

## 0. 需求摘要(原文對照)

| # | 需求 | 對應設計 |
|---|------|---------|
| 一-1 | 觀察員基礎權限對標稽核委員,但**獨立的審閱排程**(開放/截止區間與委員不同) | D3 觀察員專屬窗口 |
| 一-2 | **不開放「缺失與矯正管考」模組** | D2/D7(結構性排除) |
| 二-1 | 「實地稽核評分發現」→「**稽核發現撰寫練習**」,完全移除評分 | D5 練習工作台 |
| 二-2 | 練習內容**僅供內部檢視,絕不代入彙整工具/正式報告** | D4 硬隔離(獨立資料表) |
| 二-3 | 當場次**指派一位正式委員任指導者**,可檢視練習並回饋 | D6 師徒配對 |
| 三-1 | **多重身分並存**(同一人兼機關管理員+觀察員+委員),身分切換 | D8 授權表+切換 |
| 三-2 | **平滑晉升**觀察員→委員,妥善處理實習紀錄 | D9 晉升機制 |

---

## 1. 現況盤點(設計依據的關鍵事實)

1. **角色是單值字串**:`User.role String`(無 DB enum),TS 端 `ROLES`/`Role`/`ROLE_LABELS`(lib/types.ts)為 SoT。新增角色值 schema 零成本,成本全在 TS 授權層。
2. **Session 每請求回查 DB**:auth.ts jwt callback 於每次請求回查 `isActive/role/organizationId` 並同步進 token(即時撤銷/權限即時生效機制)。→ **身分切換與晉升可直接騎乘此機制**:改 DB,下一請求 session 自動跟上,無需動 NextAuth 換發邏輯。
3. **粗粒度授權 SoT = `lib/access-policy.ts` canAccess(Surface × Role × Phase)**,由 `test-access-matrix`(189 斷言)鎖住;細粒度(租戶/指派)在 `lib/rbac.ts`。
4. **⚠️ 新角色的最大風險 = fail-open**:
   - `rbac.ts` 兩處 `switch (user.role)` **無 default case**——未知角色直接掉出 switch = 放行(assertCycleAccess / assertDeficiencyAccess)。
   - `access-policy.ts` 多處 `role === 'AUDITOR' ? X : true`——新角色會拿到 `true`(等同中心權限)。
   - → 任何新角色上線前,**必須先把這些點改成顯式列舉+預設拒絕**,並擴充真值表把新角色整欄鎖住。
5. **委員指派表 `AuditorAssignment`** 是「委員權力」的載體:全站 `assignments.some(a => a.auditorId === user.id)` 判定即視同委員。→ 觀察員**絕不可**進此表,否則到處繼承委員權力。
6. **`AuditFinding` 是官方資料鏈的源頭**:`buildReportData`(彙整/列印/Word 共用)聚合全週期 AuditFinding;`deficiencyId` 欄位代表發現可轉入缺失管考。→ 練習內容若以「旗標」存在同一表,漏濾一處即進正式報告;**唯有獨立資料表能給「絕對不會」等級的保證**。
7. **委員審閱窗口**是單一區間(`reviewWindowStart/End`),閘在 API 層(assertEvidenceAccess/comments 等)+頁面層雙重。觀察員需要平行的第二組窗口。

---

## 2. 設計決策

### D1|OBSERVER = 第四個全域角色(非指派屬性)
`ROLES` 增為四元:`SUPER_ADMIN / ORG_ADMIN / AUDITOR / OBSERVER`,`ROLE_LABELS.OBSERVER = '觀察員'`。
- 為何不用「指派層屬性」(AuditorAssignment.role='OBSERVER'):觀察員的差異是**全站性**的(模組導覽、儀表板、窗口、練習模組、邀請/帳號管理),且事實 5 表明混入指派表會繼承委員權力,fail-open 面太大。全域角色+獨立配對表,每一處存取都是**顯式授予**(fail-closed)。

### D2|週期配對 = 新表 `CycleObserver`(含指導委員)
```prisma
model CycleObserver {
  id         String   @id @default(cuid())
  cycleId    String
  cycle      AuditCycle @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  observerId String
  observer   User @relation("ObserverAssignments", fields: [observerId], references: [id])
  // 指導委員(師徒制):必須是本週期 AuditorAssignment 中的正式委員(API 驗證)
  mentorId   String
  mentor     User @relation("MentorAssignments", fields: [mentorId], references: [id])
  createdAt  DateTime @default(now())

  @@unique([cycleId, observerId])
  @@index([cycleId, mentorId])
}
```
- 中心(SUPER_ADMIN)於週期「進階設定」指派:選觀察員(role=OBSERVER 的帳號)+ 為其配一位**本週期已指派**的委員為指導者(下拉來源=該週期 assignments)。委員被抽換時若仍為某觀察員的 mentor → 阻擋抽換或要求先改配對(API 檢核)。
- 觀察員能否看到週期 = `cycleObserver` 存在 + 階段閘(比照委員 `auditorCanSeeCycle`:DRAFT 不可見、CLOSED 鎖定)。

### D3|觀察員專屬審閱窗口
`AuditCycle` 增兩欄:`observerWindowStart/End DateTime?`。語義完全比照委員窗口(批67 裁定):**未設=不開放**;管制範圍=資料準備檢視+檢核表審閱檢視。
- `types.ts` 新增 `observerReviewWindowOpen/State`(鏡射 auditor 版);`assertEvidenceAccess`、審閱頁等處,OBSERVER 分支查的是觀察員窗口,AUDITOR 分支不動。
- 中心 UI:進階設定的窗口編輯加第二組「觀察員審閱區間」。

### D4|練習資料硬隔離 = 獨立資料表(結構性保證)
```prisma
model PracticeFinding {
  id           String @id @default(cuid())
  cycleId      String
  cycle        AuditCycle @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  observerId   String
  observer     User @relation("PracticeFindings", fields: [observerId], references: [id])
  aspect       String   // STRATEGY | MANAGEMENT | TECHNICAL(與正式發現同結構,練習才有意義)
  kind         String   // COMPLIANCE | IMPROVE | SUGGEST
  content      String
  checklistRef String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  feedbacks    PracticeFeedback[]
  @@index([cycleId, observerId])
}

model PracticeFeedback {
  id                String @id @default(cuid())
  practiceFindingId String
  practiceFinding   PracticeFinding @relation(fields: [practiceFindingId], references: [id], onDelete: Cascade)
  mentorId          String
  mentor            User @relation("PracticeFeedbacks", fields: [mentorId], references: [id])
  content           String
  createdAt         DateTime @default(now())
}
```
- 「絕對不會代入彙整/正式報告」由**型別系統與資料模型保證**:`buildReportData`、彙整工具、列印、Word、缺失匯入全部只讀 `AuditFinding`;`PracticeFinding` 無 `deficiencyId`、無任何報告端消費者。驗證手段:真值表 + `grep PracticeFinding` 消費面清單(僅練習模組)。
- **可見範圍**:觀察員本人(讀寫own)/指導委員(讀+回饋)/中心(讀,管理監督)。機關(ORG_ADMIN)完全不可見。
- 觀察員**不寫** `AuditorComment`(委員審閱筆記):筆記有機關補正等下游流程,觀察員寫入會外溢到機關端。觀察員的所有產出集中在練習模組(檢核表/審閱頁對其唯讀)。

### D5|「稽核發現撰寫練習」工作台
路由 `/cycles/[id]/practice`(觀察員版取代 `/audit`):
- 版面 = AuditPad 的 FindingSection 型態(三類發現逐條撰寫、構面/項次選擇、片語庫可沿用),**完全無 ScoreSection**(無評分表、無等第標準、無送出鎖定)。
- 側欄保留「檢核表對照」唯讀(有觀察員窗口 + 階段閘時),讓練習有素材;每條練習發現下方顯示**指導委員回饋串**。
- 頁首明示:「此為撰寫練習,內容僅指導委員與中心可見,不會進入正式稽核報告」。
- API:`/api/cycles/[id]/practice-findings`(GET/POST,觀察員本人)+ `/api/practice-findings/[pid]`(PATCH/DELETE,作者本人)+ `/api/practice-findings/[pid]/feedback`(POST,僅該觀察員之 mentor;PATCH/DELETE 自己的回饋)。

### D6|指導委員的檢視與回饋
- 指導委員在該週期的「實地稽核評分與發現」頁看到新分頁/區塊「**指導觀察員**」:列出配對觀察員的練習發現,逐條給回饋(文字)。
- 授權規則(API 層):`user.role==='AUDITOR'` 且 `CycleObserver.mentorId === user.id`(僅見**自己**帶的觀察員;非其 mentor 的委員不可見——與「委員意見僅見己見」批62 的隔離哲學一致)。
- 中心可見全部練習內容與回饋(監督/管理),唯讀。

### D7|fail-open 收斂(上線前置,P0 級)
1. `rbac.ts` 的 `switch (user.role)` 全部加 `default: throw AuthError(403)` + 顯式 `case 'OBSERVER'`。
2. `access-policy.ts` 逐 surface 顯式處理 OBSERVER(新增 surface `practice.access`;OBSERVER 對 `deficiencies.view`/`audit.score`/`signedReport.*`/`auditReport.view`/`checklist.orgEdit`/`prep.orgEdit` 一律 false;`cycle.access`/`checklist.view` 比照委員階段閘,細粒度窗口在呼叫端查觀察員窗口)。
3. `test-access-matrix` 擴充 OBSERVER 整欄(189 → 約 250+ 斷言);`test-cycle-modules` 增 OBSERVER 卡組;`test-isolation` 增觀察員夾具(跨機關、練習資料隔離、mentor 限定、報告排除)。

### D8|多重身分並存(三案比較,推薦 A)

**方案 A(推薦):一帳號 + `UserRole` 授權表 + 「User.role = 現用身分」+ 身分切換選單**
```prisma
model UserRole {
  id             String   @id @default(cuid())
  userId         String
  user           User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role           String   // SUPER_ADMIN | ORG_ADMIN | AUDITOR | OBSERVER
  organizationId String?  // ORG_ADMIN 必填;其餘 null
  createdAt      DateTime @default(now())
  createdById    String   // 授予者(權責分立)
  endedAt        DateTime? // 收回/晉升結束(留歷史,不硬刪)
  @@index([userId, endedAt])
}
```
- **語義**:`UserRole` = 此帳號「可用的身分集合」;`User.role/organizationId` 語義從「唯一身分」變為「**現用身分**」。
- **切換**:header 身分選單(僅多身分帳號顯示)→ `POST /api/identity/switch` 驗證目標授權存在且未收回 → 更新 `User.role/organizationId` → 寫 audit-log → **下一請求 jwt 回查即生效**(事實 2,零 NextAuth 改造)。切換=全域生效(非分頁各自身分),避免同瀏覽器雙身分並存的混淆與 CSRF 面。
- **遷移**:backfill 每個既有帳號一筆 UserRole(=現值);單身分使用者(絕大多數)完全無感,不顯示切換選單。
- **利益迴避(跨身分權限衝突的實質防線)**:指派委員/觀察員到某週期時,檢查該帳號是否**持有該機關的 ORG_ADMIN 授權**(查 UserRole 全集,非只現用身分)→ 阻擋並提示(自己稽核自己機關)。審計軌跡記錄切換事件與當下身分。
- 優點:一人一帳(密碼/鎖定/停用治理單點);晉升與實習紀錄同 userId 天然銜接;session/rbac/全站消費端**零改動**。缺點:`User.role` 語義擴充需在文件明示。

**方案 B:一人多帳號 + 連結表(帳號切換)**——email 唯一衝突需 alias、密碼/停權治理×N、實習紀錄跨帳號歸屬分裂(晉升後練習在舊帳號)。不推薦。

**方案 C:JWT 多角色 claims,前端自選現用角色**——與既有「DB 為準、每請求回查」的安全設計相悖,切換不落 DB 難審計,token 膨脹。不推薦。

### D9|晉升軌跡(觀察員→稽核委員)
- **Phase 1(未有 UserRole 前)**:管理端帳號編輯直接把 `role` OBSERVER→AUDITOR(既有 UI 加選項即可)。練習紀錄 keyed by userId,**原樣留存**;其後被指派為正式委員即用委員全功能。
- **Phase 2/3(有 UserRole 後)**:中心「晉升為稽核委員」一鍵動作 = ①OBSERVER 授權 `endedAt=now`(留歷史)②新增 AUDITOR 授權 ③若現用身分是 OBSERVER 同步切為 AUDITOR ④audit-log。
- **實習紀錄處置**:PracticeFinding/Feedback 永久保留(cycleId+observerId);晉升後本人與中心可於「實習紀錄」檢視歷史練習與指導回饋(Phase 3 加獨立頁);mentor 的檢視權隨週期結案自然終止。不轉換、不刪除、不混入正式發現。

---

## 3. 分批實作計畫

| 批次 | 內容 | Schema | 風險面 |
|------|------|--------|--------|
| **批30(Phase 1)** | OBSERVER 角色 + fail-open 收斂(D7)+ CycleObserver 配對 + 觀察員窗口(D3)+ 練習工作台與 API(D4/D5)+ 指導委員檢視回饋(D6)+ 模組導覽/儀表板 + 三真值表擴充 | +3 表 +2 欄(全 additive) | 授權(大軍審查:新 API×3 + rbac/access-policy 改動) |
| **批31(Phase 2)** | UserRole 授權表 + 身分切換選單/API + 利益迴避檢核 + 管理端多身分授予 UI(D8-A) | +1 表(additive;backfill script) | 授權/session(大軍審查) |
| **批32(Phase 3)** | 晉升一鍵動作 + 實習紀錄歷史頁(D9) | 無 | 低 |

每批照鐵律:build + 五真值表(擴充後)+ 機上 isolation/returns + 對抗審查(授權面)+ 部署徵得同意。

---

## 4. 觀察員權限總表(批30 目標)

| 介面 | 觀察員 | 備註 |
|------|--------|------|
| 週期清單/週期頁 | ✅ 限被配對週期 | 階段閘同委員(DRAFT 不可見/CLOSED 鎖定) |
| 稽核前資料準備(檢視) | ✅ 唯讀 | 受**觀察員窗口**管制 |
| 檢核表/委員審閱頁(檢視) | ✅ 唯讀 | 受觀察員窗口;**不可留審閱筆記**(AuditorComment 不開放) |
| 稽核發現撰寫練習 | ✅ 專屬 | ONSITE 起開放(比照 audit.score 階段),無評分 |
| 實地稽核評分與發現 | ❌ | 由練習工作台取代 |
| 缺失與矯正管考 | ❌ | 需求一-2;API+頁+磚全擋 |
| 彙整報告/列印/Word | ❌ | 練習資料結構性不可能進入 |
| 用印掃描檔 | ❌ | 委員亦不可見,觀察員同 |
| 佐證下載 | ✅ 限線上檢視(viewOnly) | 同委員待遇,窗口改查觀察員窗口 |

---

## 5. 裁定紀錄(2026-07-07)

1. **多重身分機制**:✅ 使用者裁定採**方案 A**(一帳號+UserRole 授權表+切換選單)。
2. **實作節奏**:✅ 使用者裁定「**三批一次做完再部署**」——批30+31+32 一次實作、單次驗證部署。
3. (次要,後補)觀察員練習「完成度」統計供晉升參考——留待後續需求。

## 6. 實作備註(落地時新增的決策)

- **配對池以「現用身分」為準**:觀察員配對下拉只列 `User.role==='OBSERVER'` 的帳號;多重身分者需先切至觀察員身分才會出現在池中(與「切換=全域生效」一致,避免一人同週期雙身分)。
- **觀察員不寫 AuditorComment、不勾引導清單**(工作紀錄污染防護);委員意見對觀察員整批清空(filterOwnComments)。
- **檢核表佐證窗口豁免比照委員**:觀察員於 ONSITE 起(practice.access)就地檢視檢核表佐證不受觀察員窗口限制(練習需要素材,與委員評分豁免同判準);資料準備佐證(PREP_SUBMISSION)仍受窗口管制。
- **fail-open 收斂實查**:除 rbac/access-policy 外,另補 8 處頁面 gate(checklist/audit/defId/activity/report/print×3)、nav/cycles API `: {}` 兜底、export×2、prep GET、journey toggle——歷史寫法對第四角色全是 fail-open,已逐一顯式化。
- **授權授予 API 不開 SUPER_ADMIN**:/api/admin/users/[id]/roles 僅可授 ORG_ADMIN/AUDITOR/OBSERVER;最高管理員仍走既有「改角色」,不在新 API 開提權面。
- **唯一身分不可收回**(改走停用帳號);收回現用身分自動切至另一有效身分。
