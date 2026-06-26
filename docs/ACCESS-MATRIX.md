# MOECISH 存取政策矩陣(角色 × 階段)

> 單一真實來源 = `src/lib/access-policy.ts` 的 `canAccess(surface, role, cycleStatus)`。
> 本文件為人類可讀對照;規格由 `npm run test:access`(`src/scripts/test-access-matrix.ts`)鎖定,改動 canAccess 會被測出。
> **本表只管「角色 × 階段」粗粒度閘。** 細粒度(租戶/指派隔離、項目狀態如已送出/已確認/鎖定)仍由各 route 的
> `assertCycleAccess` / `assertEvidenceAccess`(`lib/rbac`)與狀態判斷把關。

週期 7 階段:開立中 `DRAFT` → 資料準備中 `PREPARATION` → 資料齊備 `READY` → 實地稽核 `ONSITE` → 缺失發布中 `REPORT_ISSUED` → 矯正執行中 `REMEDIATION` → 結案 `CLOSED`。

## 矩陣(✓=允許,空=拒絕)

| 介面 surface | 角色 | DRAFT | PREP | READY | ONSITE | REPORT | REMED | CLOSED |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **checklist.view**<br>委員看機關檢核表(頁/審閱/匯出/佐證/留言) | 中心 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| | 機關 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| | **委員** | | | ✓ | ✓ | ✓ | ✓ | ✓ |
| **checklist.orgEdit**<br>機關填寫/送出檢核表(符合度/說明/批次/佐證) | 中心 | | | | | | | |
| | **機關** | | ✓ | | | | | |
| | 委員 | | | | | | | |
| **prep.orgEdit**<br>機關上傳/填說明/繳交資料準備 | 中心 | | | | | | | |
| | **機關** | | ✓ | | | | | |
| | 委員 | | | | | | | |
| **signedReport.section**<br>用印掃描檔整段可見 | 中心 | | | | | | ✓ | ✓ |
| | 機關 | | | | | | ✓ | ✓ |
| | 委員 | | | | | | | |
| **signedReport.upload**<br>上傳用印掃描檔 | 中心 | | | | | | | |
| | **機關** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| | 委員 | | | | | | | |
| **auditReport.view**<br>彙整報告(全體委員整合) | **中心** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| | 機關 | | | | | | | |
| | 委員 | | | | | | | |

## 重點規則(白話)
- **委員看機關資料的分界 = 資料齊備(READY)**:在「開立中 / 資料準備中」一律看不到機關檢核表內容與佐證(同 `auditorCanSeePrep` 之 prep 分界)。
- **機關填檢核表 / 上傳資料準備 = 僅資料準備中**:開立中(中心剛建立週期、尚在設定日期/指派委員)機關一律不可填報/上傳;中心推進至「資料準備中」並通知機關後才開放;離開資料準備後凍結(檢核表另由 `已送出` 鎖定)。
- **用印掃描檔**:只在矯正執行中之後出現,且只給機關(上傳)+ 中心(確認/檢視);委員不參與。
- **彙整報告**:中心專用;委員列印自己的附件17、機關不涉入。

## 細粒度(不在本表、由呼叫端把關)
- 租戶/指派:機關只看自家;委員只看被指派週期(`assertCycleAccess` / `assertEvidenceAccess`)。
- 項目狀態:檢核表 `已送出` 後機關鎖定;prep `已繳交/已確認` 後鎖定需中心退回;用印掃描檔 `已確認/結案` 後機關不可再上傳。
- 評分/發現鎖定:委員「確認填寫完畢」後其評分/發現唯讀(`assertAuditorScoreUnlocked`)。

## 新增受管制介面時
1. 在 `access-policy.ts` 的 `Surface` 加一個鍵 + `canAccess` 加規則。
2. 在 `test-access-matrix.ts` 的 `EXPECT` 補該介面的預期真值(規格)。
3. 頁面/API/入口磚改呼叫 `canAccess`,不要內聯階段判斷。
4. 更新本表。
