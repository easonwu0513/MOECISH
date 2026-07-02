# MOECISH 交接指南(HANDOFF)

> 給新視窗 / 新帳號無痛接手 MOECISH UAT 持續處理工作。
> 同一台機器開的 Claude Code 會自動載入 `MEMORY.md`;換機器時本檔為唯一上手依據。
> 最後更新:2026-07-02(批63 上線、PR #55 併回 main)。

---

## 一、專案

教育部醫療資安稽核管考平台 **MOECISH 2.0**
Next.js 14 App Router + Prisma / PostgreSQL + NextAuth,三角色:

| 角色 | 代碼 | 說明 |
|---|---|---|
| 中心 | `SUPER_ADMIN` | 教育部轄下醫療領域資訊安全推動中心(最高管理員) |
| 機關 | `ORG_ADMIN` | 受稽醫院管理員 |
| 委員 | `AUDITOR` | 稽核委員 |

## 二、環境

- **工作目錄**:`C:\Users\User\Playground\MOECISH`
  ⚠️ 務必用這個,**不要**用 `.claude\worktrees` 下的複本。
- **回覆語言**:繁體中文。
- **開發分支**:`claude/serene-black-839211`(=serene);`main` 為 PR 併回目標。
- **正式機(prod)**:`140.112.97.160`,現行版號 `f3bf2b4`(批63)。
- **目前狀態**:serene 與 main 同步於 `01286ba`(PR #55)。

## 三、每批處理流程

使用者會丟一組繁中標註的 UAT 截圖(=一批)。逐批:

1. 讀相關程式碼 → 實作
2. `build` + 三真值表(見驗證鐵律)
3. **選擇性審查**:若該批含 `async / 併發 / 新 API / schema / 授權 / 通知` → 開 Workflow 三鏡對抗審查(旁路 / 邏輯 / UX,只審那幾支)。純文案 / UI / CSS 不開,走 build + 真值表 + self-review。**開審查前先講一句。**
4. 在 serene commit(訊息 `feat(批NN): …`)
5. **逐批**用 `AskUserQuestion` 取得部署同意(守門員,per-action,前批同意不延用)
6. 同意後依 runbook 部署 → 驗證 → 更新記憶 → 回報使用者

## 四、驗證鐵律

```
build
+ npm run test:access   (189)
+ npm run test:notify   (21)
+ npm run test:punct    (31)
+ prod live test:isolation (41)
```

全綠才算過。

## 五、部署 runbook

```bash
# 1. 打包(排除 .git/node_modules/.next/.env*/.claude/uploads/*.tar.gz/tsconfig.tsbuildinfo)
tar --exclude='.git' --exclude='node_modules' --exclude='.next' \
    --exclude='.env' --exclude='.env.*' --exclude='.claude' \
    --exclude='uploads' --exclude='*.tar.gz' --exclude='tsconfig.tsbuildinfo' \
    -czf "$SCRATCH/moecish-src.tar.gz" .

# 2. 上傳(SSH key: /c/Users/User/.ssh/moecish_deploy_rsa)
scp -i /c/Users/User/.ssh/moecish_deploy_rsa "$SCRATCH/moecish-src.tar.gz" \
    useradmin@140.112.97.160:/tmp/moecish-src.tar.gz

# 3. 在 prod 執行(寫版號 → 停服 → 重部署)
ssh -i ... useradmin@140.112.97.160 \
  'sudo -n runuser -u moecish -- bash /tmp/set-rev.sh <rev> \
   && sudo -n systemctl stop moecish \
   && sudo -n bash /tmp/moecish-prod-redeploy2.sh'
   # redeploy2.sh 內含 npm install + prisma db push + build + restart

# 4. 驗證
curl http://localhost:3001/api/version   # 確認 rev
# 跑 live test:isolation
```

- **sudoers 白名單**:僅 `systemctl stop/start/restart/daemon-reload/show moecish`、`bash /tmp/moecish-prod-redeploy2.sh`、`runuser -u moecish *`。
- **schema 有改**:`prisma db push` 會自動套 additive 欄位;本機先 `npx prisma generate` 再 build。
- **精靈 seed 變動**:另跑對應 `src/scripts/migrate-*.ts`(冪等)。

## 六、git 與併回

- **push 需先** `gh auth setup-git`(HTTPS remote 認證身分 `Easonwu1983` 無推送權;gh 登入為 owner `easonwu0513` 有權)。
- **併回 main**:`gh pr create --base main --head claude/serene-black-839211 …` → `gh pr merge <n> --merge`(保留每批,**不刪** serene 分支)。
- 歷史:PR #52→d917935、#53→f069947、#54→0169641、**#55→01286ba(最新)**。

## 七、記憶

- 位置:`C:\Users\User\.claude\projects\C--Users-User-Playground-MOECISH\memory\`
- `MEMORY.md` = 索引(同機自動載入);`moecish-current-state.md` = 交接快照(每批更新)。
- 每批部署後務必更新兩處:交接快照的「⭐最新狀態」開頭 + 「最新=第 N 批」指標行。

## 八、已知待辦

- `redeploy2.sh` 缺 `set -o pipefail`(build 失敗碼會被 `tail` 吃掉,下次部署窗口補)。
- 擬人走查(三角色 × 七階段 Chrome MCP)未跑。
- **上線前 A 類維運**:計中開 443、關 demo 模式、密鑰輪替、SECURITY_BASELINE 啟用、備份加密、弱掃 + 滲透。

## 九、常見雷區(踩過的)

- 加「送出前驗證閘」時同時查四件:並行寫入 TOCTOU / 驗證基準事後可變 / 閘上線前存量資料在唯讀頁的顯示 / 規則邊界與既有文案矛盾。
- check-then-act 全家族(POST/PATCH/DELETE)要交易化(Serializable)或條件式寫入;治理閘要「三動詞全蓋」。
- 改共用函式簽名:伺服器上任何非 tar 管理的殘留 `.ts` 都會炸 build(一次性腳本一律放 `src/scripts` 或用完即刪)。
- 精靈 seed「已存在即跳過」→ 改精靈項目要冪等遷移腳本,seed 與腳本標題須逐字一致(含全形標點)。
- 色彩 SoT 兩處要同步:`globals.css :root` + `tailwind.config.ts`。
- 大軍撞平台 session limit 時,未驗證的發現 ≠ 已駁回,要自驗。

---

**上手第一步**:先讀 `MEMORY.md` 與 `docs/HANDOFF.md` 對齊最新狀態,再等使用者丟下一批 UAT 截圖。
