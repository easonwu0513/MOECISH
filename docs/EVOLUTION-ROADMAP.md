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
| 中心跨院 KPI strip（進行中/落後/平均矯正完成率） | 🔄 | `admin/cycles` 已有落後篩選+停滯偵測,補頂部 StatTopBar 一眼總覽 |
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
| GraphMail HTTP 暫時性失敗重試(401 強制換 token / 429 / 5xx 退避) | 🔄 | S | 核實修正:`graph-mail.ts` **已有網路層 fetchWithRetry**,真缺口是 **HTTP 狀態碼失敗未重試**(401/429/5xx 直接丟出→漏信)。已實作(待 build/部署),**免 migration** |
| EmailLog status/retryCount 欄 + 死信補寄 timer | 🔲 | M | 目前 delivery 記在 context JSON;加可查詢欄位 + 全部重試失敗後的 requeue。**需 schema migration**,待分類器/可部署時做 |
| request-id 追蹤 + 結構化 JSON 日誌 + `/api/health` | 🔲 | M | 對齊既有 Loki/Grafana;事件響應 10x 快 |
| 全域授權 middleware（粗粒度閘,細粒度仍留 route） | 🔲 | M | 補「忘記檢查」的繞過風險;與 lib/rbac 分層不取代 |
| 跨機關隔離升級為 E2E + pre-deploy CI gate | 🔲 | M | 既有 `test:isolation` script 升級 |

## 批次 ③ 歷年同類缺失追蹤（topPick #1,四視角共鳴）
| 項目 | 狀態 | 工時 | 說明 |
|---|---|---|---|
| `lib/deficiency-history.ts`（核實不存在=真 net-new） | 🔲 | M | 同機關同 checklistRef/同構面跨 2-3 年重複偵測 |
| 缺失內頁歷史側欄（往年根因+矯正供參） | 🔲 | M | 機關不敢敷衍、委員有籌碼、中心可政策介入 |
| 中心端 repeat-offender 彙整匯出 | 🔲 | M | 系統性政策依據 |

## 批次 ④ 上線治理（D+ → C 硬門檻）
| 項目 | 狀態 | 工時 | 說明 |
|---|---|---|---|
| 啟用備份/還原 timer + 可用性指標化 | 🔲 | M | `infra/` timers **已寫好待啟用**=補完;政府審查必看 |
| 稽核軌跡覆蓋補完 + 全域 API wrapper | 🔲 | M | `writeAuditLog` 已 127 處;補狀態轉換/帳號變更/寄信 |
| 帳號生命週期 + 權責分立工作流 | 🔲 | M | 停用需 SUPER_ADMIN 核准+理由+記 AuditLog |
| 機敏欄位 at-rest 加密層 | 🔲 | M | Graph token 現明放 `.graph-token.json` |
| 資料保留政策 + 生命週期清理 | 🔲 | L | 檔案法 ≥5 年 |
| MFA（TOTP）基礎架構,SUPER_ADMIN 強制 | 🔲 | M | 現在埋 schema 便宜 |

## 共用地基提醒
所有不存在的 admin 分析頁（cycle-readiness / bottleneck / overdue-tracking / prep-timeline …）查詢邏輯高度重疊
→ **先建單一 `src/lib/analytics` 聚合層再分批掛頁**,避免 `process-guide.ts` 式平行系統。

## 已排除（核實已上線)
ActionForm autoSavedAt 顯示(已實作)、登入成功稽核(auth.ts:130 已記)、跨機關隔離 script(已存在)。
