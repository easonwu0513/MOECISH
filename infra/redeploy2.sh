#!/bin/bash
# MOECISH 正式機重新部署(版控權威版;取代僅存於 VM /tmp、易隨 VM 消失的個人副本)。
# 流程:解壓 tarball → npm ci(可重現)→ 版號自動注入 → prisma db push/generate → build → 裝 systemd 單元 → 重啟 → 自驗。
#
# 執行:useradmin 以 `sudo /usr/bin/bash <此腳本>`(sudoers NOPASSWD)。
# 前置:先 scp 好 /tmp/moecish-src.tar.gz(= `git archive HEAD`;版號由 .gitattributes export-subst 內嵌 infra/build-rev.txt,毋須再手 sed .env)。
# 驗證(只認):curl http://127.0.0.1/api/version 的 rev 翻新 + securityBaseline=true。log 見 /tmp/moecish-redeploy.log。
# ⚠️一次性:把本檔同步為 VM 上 sudoers 白名單的實際路徑(/tmp/moecish-prod-redeploy2.sh)後,實際跑的即等於版控的。
set -eo pipefail
exec > /tmp/moecish-redeploy.log 2>&1

cp /tmp/moecish-src.tar.gz /srv/moecish/src.tar.gz
chown moecish:moecish /srv/moecish/src.tar.gz

runuser -u moecish -- bash -s << 'INNER'
set -eo pipefail
cd /srv/moecish
rm -rf src prisma docs assets preview ui_kits infra .next
tar -xzf src.tar.gz 2>/dev/null

# npm ci(取代 npm install):以 package-lock.json 位元級可重現安裝(同 commit 必得同結果)。
# --include=dev:build 需要 next/typescript/tailwind/tsx 等 devDependencies,不論 NODE_ENV 一律裝齊。
npm ci --include=dev --no-audit --no-fund 2>&1 | tail -3

set -a; . ./.env; set +a

# 版號自動注入(取代手動 sed .env,消除雷#7 假成功):git archive 經 export-subst 已把 infra/build-rev.txt
# 的 $Format:%h$ 換成當次短雜湊;非 archive 建置(仍為字面 $Format)則不覆寫、沿用 .env。
REV=$(tr -d ' \t\r\n' < infra/build-rev.txt 2>/dev/null || true)
case "$REV" in
  '' | *Format:*) echo "build-rev 未注入(非 archive 建置),沿用 .env 版號" ;;
  *) export NEXT_PUBLIC_BUILD_REV="$REV"; export NEXT_PUBLIC_BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M)"; echo "版號注入 NEXT_PUBLIC_BUILD_REV=$REV" ;;
esac

npx prisma db push --skip-generate 2>&1 | tail -2
npx prisma generate 2>&1 | tail -1
npm run build 2>&1 | tail -3
echo BUILD_OK
INNER

# ── systemd 單元安裝/更新(idempotent;root) ──
install_unit() { cp "/srv/moecish/infra/$1" "/etc/systemd/system/$1"; }

cp /srv/moecish/infra/moecish-health.sh /usr/local/bin/moecish-health.sh
chmod +x /usr/local/bin/moecish-health.sh
install_unit moecish-health.service
install_unit moecish-health.timer
[ -f /srv/moecish/infra/moecish-tracking.timer ] && { install_unit moecish-tracking.service; install_unit moecish-tracking.timer; }
[ -f /srv/moecish/infra/moecish-email-retry.timer ] && { install_unit moecish-email-retry.service; install_unit moecish-email-retry.timer; }
[ -f /srv/moecish/infra/moecish-graph-refresh.timer ] && { install_unit moecish-graph-refresh.service; install_unit moecish-graph-refresh.timer; }
if [ -f /srv/moecish/infra/moecish-backup.sh ]; then
  cp /srv/moecish/infra/moecish-backup.sh /usr/local/bin/moecish-backup.sh
  cp /srv/moecish/infra/moecish-restore-test.sh /usr/local/bin/moecish-restore-test.sh
  chmod +x /usr/local/bin/moecish-backup.sh /usr/local/bin/moecish-restore-test.sh
  install_unit moecish-backup.service; install_unit moecish-backup.timer
  install_unit moecish-restore-test.service; install_unit moecish-restore-test.timer
fi

systemctl daemon-reload
systemctl enable --now moecish-health.timer
[ -f /etc/systemd/system/moecish-tracking.timer ] && systemctl enable --now moecish-tracking.timer
[ -f /etc/systemd/system/moecish-email-retry.timer ] && systemctl enable --now moecish-email-retry.timer
[ -f /etc/systemd/system/moecish-graph-refresh.timer ] && systemctl enable --now moecish-graph-refresh.timer
echo "HEALTH_TIMER=$(systemctl is-active moecish-health.timer)"
echo "TRACKING_TIMER=$(systemctl is-active moecish-tracking.timer 2>/dev/null || echo n/a)"
echo "EMAIL_RETRY_TIMER=$(systemctl is-active moecish-email-retry.timer 2>/dev/null || echo n/a)"
echo "GRAPH_REFRESH_TIMER=$(systemctl is-active moecish-graph-refresh.timer 2>/dev/null || echo n/a)"
echo "BACKUP_TIMER=$(systemctl is-enabled moecish-backup.timer 2>/dev/null || echo not-installed)"

systemctl restart moecish
sleep 6
systemctl is-active moecish
curl -s -o /dev/null -w "login HTTP %{http_code}\n" http://127.0.0.1/login
curl -s http://127.0.0.1/api/version; echo
echo REDEPLOY_DONE
