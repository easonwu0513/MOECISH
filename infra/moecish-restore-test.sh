#!/bin/bash
# 備份還原測試(防護基準中級:應定期測試備份資料,驗證可靠性與完整性):
# 取最新 dump 還原到臨時資料庫,驗證關鍵資料表筆數後清除。
# 啟用:systemctl enable --now moecish-restore-test.timer(每週日)
set -e
BACKUP_ROOT=/srv/backups
LATEST=$(ls -1t "$BACKUP_ROOT/db/"*.dump 2>/dev/null | head -1)

if [ -z "$LATEST" ]; then
  logger -t moecish-restore-test "FAIL: 沒有任何備份檔可測試"
  runuser -u moecish -- bash -c 'cd /srv/moecish && npx tsx src/scripts/send-alert.ts "[MOECISH][警報] 備份還原測試失敗" "找不到任何資料庫備份檔,請檢查 moecish-backup.timer 是否啟用。"' || true
  exit 1
fi

runuser -u postgres -- dropdb --if-exists moecish_restoretest
runuser -u postgres -- createdb moecish_restoretest
runuser -u postgres -- pg_restore -d moecish_restoretest --no-owner --role=postgres "$LATEST"

USERS=$(runuser -u postgres -- psql -tA -d moecish_restoretest -c 'SELECT count(*) FROM "User";')
CYCLES=$(runuser -u postgres -- psql -tA -d moecish_restoretest -c 'SELECT count(*) FROM "AuditCycle";')
ITEMS=$(runuser -u postgres -- psql -tA -d moecish_restoretest -c 'SELECT count(*) FROM "ChecklistItem";')
runuser -u postgres -- dropdb moecish_restoretest

if [ "$USERS" -ge 1 ] && [ "$ITEMS" -ge 1 ]; then
  logger -t moecish-restore-test "OK: $(basename "$LATEST") users=$USERS cycles=$CYCLES items=$ITEMS"
  echo "restore test OK: users=$USERS cycles=$CYCLES items=$ITEMS"
else
  logger -t moecish-restore-test "FAIL: 還原內容異常 users=$USERS items=$ITEMS"
  runuser -u moecish -- bash -c 'cd /srv/moecish && npx tsx src/scripts/send-alert.ts "[MOECISH][警報] 備份還原測試異常" "最新備份還原後關鍵資料表筆數異常,請人工檢查備份。"' || true
  exit 1
fi
