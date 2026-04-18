# MOECISH — 資通安全稽核管考系統（雛形）

根據「115 年資通安全實地稽核檢核表」設計的網頁管考系統雛形。涵蓋兩大模組：
- **模組一**：受稽機關填寫 83 題檢核表 → 主管簽章 → 委員意見 ⇄ 受稽機關補正
- **模組二**：委員開立稽核發現（策略/管理/技術 × 法遵/待改善/建議）→ 受稽機關填改善措施 → 委員審核（通過/持續改正，可多輪）

## 技術堆疊

- Next.js 14 (App Router) + TypeScript
- Prisma ORM + SQLite（開發用；正式環境切 PostgreSQL 僅需改 `schema.prisma` 的 provider）
- NextAuth (credentials) + bcryptjs
- Tailwind CSS
- Zod 驗證
- adm-zip + fast-xml-parser（解析 ODT 檢核表）

## 快速啟動（同事第一次 clone）

需求：**Node.js 20+** 與 npm。

```bash
# 1. clone
git clone <repo-url>
cd MOECISH

# 2. 建立環境變數
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env

# 3. 安裝依賴
npm install

# 4. 建立資料庫 schema + 匯入 83 題 + 建測試帳號
npm run db:push
npm run db:seed

# 5. 啟動
npm run dev
# 打開 http://localhost:3000
```

ODT 檢核表已放在 `prisma/seeds/checklist-115.odt`，seed 會自動讀取；無需額外下載。

如要改用其他 ODT：

```bash
CHECKLIST_ODT="D:/path/to/自訂檢核表.odt" npm run db:seed
# 或單跑匯入
npm run import:checklist -- "D:/path/to/檢核表.odt" 2026
```

## 重置資料庫

```bash
npm run db:reset   # 刪 dev.db 後重建並重跑 seed
```

## 測試帳號（密碼皆為 `demo1234`）

| Email | 角色 |
|---|---|
| `admin@demo.tw` | 平台管理員 |
| `auditor@demo.tw` | 稽核委員 |
| `respondent@demo.tw` | 填報人（示範大學附設醫院） |
| `supervisor@demo.tw` | 單位主管（示範大學附設醫院） |

## 端對端 Demo 劇本

**模組一**
1. `respondent@demo.tw` 登入 → 進入 2026 年度稽核 → 「模組一 檢核表填報」
2. 展開任意題（例 1.1），選「符合」、填說明、按**儲存**，再上傳一個 PDF 當佐證
3. 回到稽核週期頁 → 按「→ 填報人已送出」
4. 登出，`supervisor@demo.tw` 登入 → 進入同一週期 → **上傳單位主管簽章**（PNG/JPG）
5. 按「→ 主管已核可」（系統會擋：未簽章 400）；簽章後就能通過

**委員意見往返**
6. `admin@demo.tw` 登入 → 把狀態推到 IN_REVIEW（SUPERVISOR_APPROVED → IN_REVIEW）
7. `auditor@demo.tw` 登入 → 「委員審閱」頁 → 對 5.1 新增意見「委外契約缺風險評估」
8. 系統自動把狀態推到 COMMENTS_RETURNED
9. 回到 respondent → 該題會標示「委員意見待補 1」→ 補充說明後點「標記為已補正」
10. 全部補正後系統自動回到 IN_REVIEW

**模組二**
11. `auditor@demo.tw` 把狀態推到 FINDINGS_ISSUED → 「模組二 稽核發現與改善」→ 建立發現
    - 編號 `5.1`、管理面、待改善事項、構面 OUTSOURCING
    - 標題「委外業務未做風險評估」、敘述從稽核報告貼上
12. `respondent@demo.tw` 回到模組二 → 看到 5.1 → 填 根因、改善措施（勾選 tags）、預計完成時程、進度追蹤、執行情形 → 上傳佐證 → **送出審核**
13. `auditor@demo.tw` → 按「持續改正」+ 留言 → 系統開新一輪
14. respondent 補佐證再送 → auditor 按「審核通過」
15. 全部 NEEDS_IMPROVEMENT 都 APPROVED 後 → 週期自動 CLOSED

**審計軌跡**
- 用 `npx prisma studio` 打開 `AuditLog` 表可看到每一步 action / actor / IP / before-after。

## 目錄結構

```
prisma/
  schema.prisma           # 13 個 model
  seed.ts                 # 測試資料 + ODT 匯入
src/
  app/
    login/                # 登入頁
    page.tsx              # 我的稽核週期
    cycles/[id]/          # 稽核週期總覽 + 簽章 + 狀態轉換
    cycles/[id]/checklist/  # 模組一填報
    cycles/[id]/review/     # 委員審閱 + 留言
    cycles/[id]/findings/   # 模組二改善
    api/
      auth/[...nextauth]/
      cycles/[id]/transition/
      cycles/[id]/checklist/[itemNo]/
      cycles/[id]/findings/
      cycles/[id]/signatures/
      responses/[id]/comments/
      responses/[id]/comments/[commentId]/resolve/
      findings/[id]/remediation/
      findings/[id]/remediation/decisions/
      evidences/
      evidences/[id]/download/
  lib/
    auth.ts               # NextAuth 設定
    db.ts                 # Prisma singleton
    rbac.ts               # 角色與 cycle 存取權檢查
    state-machine.ts      # 11 條合法轉換
    storage.ts            # local disk storage adapter (可換 S3)
    audit-log.ts
    dimension.ts          # 9 構面 labels
    types.ts              # 所有 enum 常數（SQLite 用 string 相容）
  scripts/
    parse-odt.ts          # ODT 解 zip + XML 萃取表格
    import-checklist.ts
uploads/                  # 佐證與簽章檔（gitignore）
```

## 待擴充

- M5 匯出：Excel 檢核表 (ExcelJS)、Word 改善報告 (docxtemplater)、PDF 彙總 (puppeteer)
- M6 加固：Auditor 指派查表控管、sha256 驗證 UI、越權測試、上傳大小與病毒掃描
- 換成 PostgreSQL（改 `schema.prisma` provider + 把 `actionTagsJson` 改回 `String[]`）

## 環境變數

```
DATABASE_URL     SQLite 檔路徑或 Postgres 連線字串
NEXTAUTH_SECRET  session 簽章密鑰（正式請用 openssl rand -hex 32）
NEXTAUTH_URL     http://localhost:3000
STORAGE_DIR      佐證與簽章儲存根目錄（預設 ./uploads）
CHECKLIST_ODT    seed 時的 ODT 路徑（預設為 Desktop 上的檢核表）
```
