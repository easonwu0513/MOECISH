# MOECISH VM 部署備忘

## 環境(本機 VirtualBox「MOECISH」VM = 未來 NTU prod 共存範本)
- Ubuntu 24.04 / Node 22 / PostgreSQL 16 / Caddy
- SSH: admin@127.0.0.1:2223(NAT forward);app: host 13001 → guest 3001
- Linux user `moecish`,程式於 /srv/moecish,DB `moecish`

## 首次部署
1. provision:建 moecish user + postgres role/db + /srv/moecish + .env(chmod 600)
2. 上傳原始碼 tar(排除 node_modules/.next/.git),解壓到 /srv/moecish
3. `npm install --include=dev` → `npx prisma generate` → `npx prisma db push` → `npm run db:seed` → `npm run build`
4. 安裝 systemd unit:`cp infra/moecish.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now moecish`

## 啟用真寄信(一次性)
```
sudo -u moecish bash -lc 'cd /srv/moecish && npm run graph:init'
# device code → 瀏覽器 microsoft.com/devicelogin → moecish@m365.ntu.edu.tw 登入同意
```
token 存於 /srv/moecish/.graph-token.json(已列入 unit 的 ReadWritePaths,自動續期)。
未初始化前 email 以「模擬」模式記錄,不影響業務流程。

## .env 必要變數
DATABASE_URL / NEXTAUTH_SECRET / NEXTAUTH_URL / STORAGE_DIR
(AZURE_TENANT_ID / AZURE_CLIENT_ID 有預設值,指向 MOECISH app)

## 更新部署
git pull(或上傳 tar)→ npm install → prisma db push(如 schema 變)→ npm run build → systemctl restart moecish
