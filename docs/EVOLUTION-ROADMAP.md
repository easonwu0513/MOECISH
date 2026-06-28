# MOECISH 進化路線圖

> 來源:2026-06-24「PM × 工程師 × 中心 × 機關 × 委員 × 上線治理」六視角大軍(56 提案 → 去重 ~28),
> 並經**逐項對現有程式碼核實**(很多 quick-win 其實早已上線)。本檔為計畫底稿 + 進度追蹤。
> 狀態圖例:🔲 待做 ・ 🔄 進行中 ・ ✅ 已完成 ・ ⏭️ 經核實已存在/不適用而略過。

## 核心洞察
**MOECISH 目前每年「從零開始」、無跨年度記憶。** 四視角(PM/中心/機關/委員)獨立提出同一件事 →
**歷年同類缺失追蹤**,是把「一次性稽核」升級為「持續改善管考平台」的最大差異化。

---

## 批次 ① Quick-win（經核實:大多已上線）
| 項目 | 狀態 | 說明 |
|---|---|---|
| 中心跨院 KPI strip（進行中/落後/平均矯正完成率） | ✅ | `admin/cycles` 落後篩選+停滯偵測之上,補頂部 StatTopBar 三欄一眼總覽;已上線 `e1dff4a` |
| `duration-180` 失效動畫 + scrim token | ⏭️ | 核實:`duration-180` 0 命中、`.scrim` 已 token 化(globals.css:171,Dialog/Sheet/CommandPalette/AppShell 已用) |
| `not-found / error / global-error` 頁 | ⏭️ | 核實:三支**都已存在** |
| 缺失逾期倒數 Chip | ⏭️ | 核實:`DeadlineChip` 已在 deficiencies 頁首(:110) |
| 缺失全完成取消自動導向 | ⏭️ | 核實:`ActionForm` 已僅在 `remaining>0` 才前進(:261) |
| 委員「確認填寫完畢」前完整度檢查 | ⏭️ | 核實:評分**刻意支援部分評分**(多委員分攤構面),硬性完整度檢查會誤報 → 不適用 |
| 委員「待我審查」進度卡 | ⏭️ | 核實:篩選 chip 已含 待填/審查中/已通過 計數 + 「開始連續審查(N)」 |
| 前端機敏值洩漏 lint | 🔲 | `.gitignore` 已覆蓋 `.env*`/`.graph-token.json`;eslint 規則歸併入批次④治理 |
| 首頁聯絡卡 + FAQ | 🔲 | PM 提案,降 email 量;待評估(未核實首頁現況) |

## 批次 ② 工程真韌性缺口（核實=真缺口）
| 項目 | 狀態 | 工時 | 說明 |
|---|---|---|---|
| GraphMail HTTP 暫時性失敗重試(401 強制換 token / 429 / 5xx 退避) | ✅ | S | `graph-mail.ts` 既有網路層 fetchWithRetry 之上補 HTTP 狀態碼層 4 次退避;已上線 `e1dff4a` |
| EmailLog status/retryCount 欄 + 死信補寄 timer | ✅ | M | 加 `status`/`retryCount`/`lastRetryAt` 可查詢欄(附加 migration);死信補寄改用 **systemd timer**(`infra/moecish-email-retry.*`,每 10 分,非 in-process setInterval→避免 blue/green 雙觸發);達上限轉「死信」可後台人工重寄 |
| 跨機關隔離 → pre-deploy gate | ✅ | S | `infra/redeploy-gate.sh`:build → 臨時實例跑 `test:isolation` → **通過才切換正式服務**,失敗寄警報並維持舊版 |
| request-id 追蹤 + 結構化 JSON 日誌 + `/api/health` | 🔲 | M | 對齊既有 Loki/Grafana;**次波**:與下項合併為單一 `middleware.ts`;NextAuth 為 DB-backed session,須驗證 middleware 不每請求查 DB |
| 全域授權 middleware（粗粒度閘,細粒度仍留 route） | 🔲 | M | 補「忘記檢查」的繞過風險;與上項共用單一 middleware,與 lib/rbac 分層不取代;**次波** |

## 批次 ③ 歷年同類缺失追蹤（topPick #1,四視角共鳴）
| 項目 | 狀態 | 工時 | 說明 |
|---|---|---|---|
| `lib/deficiency-history.ts`（核實不存在=真 net-new） | ✅ | M | 單一 lib 三導出(`findRepeatDeficiencies` 內頁 / `findRepeatOffenders` 中心匯出);同機關同 checklistRef(退回同構面)跨年偵測,唯讀、租戶隔離靠 organizationId;已上線 |
| 缺失內頁歷史側欄（往年根因+矯正供參） | ✅ | M | 缺失內頁新增「歷年同類缺失」Timeline 區:往年年度/狀態/當年根因/當年矯正,點擊跳該年缺失;已上線 |
| 中心端 repeat-offender 彙整匯出 | ✅ | M | `/api/admin/export/repeat-offender` Excel(跨 ≥2 年度重複者),`admin/cycles` 新增下載鈕;已上線 |

## 批次 ④ 上線治理（D+ → C 硬門檻）
| 項目 | 狀態 | 工時 | 說明 |
|---|---|---|---|
| 帳號生命週期 + 權責分立工作流 | ✅ | M | 停用須附理由(必填)+ 記操作者/時間快照(`disabledBy/At/Reason`,附加 migration)+ AuditLog;後台顯示停用理由;已上線 |
| 資料保留政策 + 生命週期清理 | 🔄 | L | 已落地純常數政策層 `lib/retention-policy.ts`(檔案法 ≥5 年、到期計算、法定下限驗證,**無副作用**);封存/清理執行面(會隱藏/刪資料)**待明確同意後另案**、預設停用、軟封存非硬刪 |
| MFA（TOTP）基礎架構,SUPER_ADMIN 強制 | 🔲 | M | **次波**:加 `totpSecret/Enabled` 欄 + totp.ts(共用 crypto.ts)+ setup/confirm/disable;預設 OFF→對現有登入零影響;需 `speakeasy`+`qrcode` 套件 |
| 機敏欄位 at-rest 加密層 | 🔲 | M | **次波**:`crypto.ts`(AES-256-GCM,與 MFA 共用);Graph token 現明放 `.graph-token.json`;設計成 `ENCRYPTION_KEY` 未設走明文(現狀)、設了才加密,須能讀舊明文再轉,consent 後撥 |
| 稽核軌跡覆蓋補完 + 全域 API wrapper | ⏭️ | M | 核實:70 個 mutating handler 已記 69 個(132 筆 writeAuditLog),唯一未記為唯讀=正確;無實質淨缺口 |
| 啟用備份/還原 timer + 可用性指標化 | ⏭️ | M | 核實:備份/還原/健康 `.sh/.service/.timer` 皆已存在;只剩 `systemctl enable`(非程式、A 類、且先前明示「先不啟用」)→ 待上線前由維運撥 |

## 共用地基提醒
所有不存在的 admin 分析頁（cycle-readiness / bottleneck / overdue-tracking / prep-timeline …）查詢邏輯高度重疊
→ **先建單一 `src/lib/analytics` 聚合層再分批掛頁**,避免 `process-guide.ts` 式平行系統。

## 已排除（核實已上線)
ActionForm autoSavedAt 顯示(已實作)、登入成功稽核(auth.ts:130 已記)、跨機關隔離 script(已存在)。
