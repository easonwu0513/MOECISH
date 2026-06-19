#!/bin/bash
# MOECISH 每日備份(防護基準中級「資料備份」):
#   - PostgreSQL pg_dump(custom format)
#   - uploads 上傳檔 tar
#   - SHA-256 清單(完整性)
#   - 保留 30 天
# 啟用:systemctl enable --now moecish-backup.timer
set -e
BACKUP_ROOT=/srv/backups
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$BACKUP_ROOT/db" "$BACKUP_ROOT/uploads"

# 1) 資料庫
runuser -u postgres -- pg_dump -Fc -d moecish -f "/tmp/moecish-$STAMP.dump"
mv "/tmp/moecish-$STAMP.dump" "$BACKUP_ROOT/db/"

# 2) 上傳檔(佐證/掃描檔)
tar -czf "$BACKUP_ROOT/uploads/uploads-$STAMP.tar.gz" -C /srv/moecish uploads 2>/dev/null || true

# 3) 完整性清單
( cd "$BACKUP_ROOT" && sha256sum "db/moecish-$STAMP.dump" "uploads/uploads-$STAMP.tar.gz" >> MANIFEST.sha256 )

# 4) 保留 30 天
find "$BACKUP_ROOT/db" -name '*.dump' -mtime +30 -delete
find "$BACKUP_ROOT/uploads" -name '*.tar.gz' -mtime +30 -delete

SIZE=$(du -sh "$BACKUP_ROOT" | cut -f1)
logger -t moecish-backup "backup done: $STAMP (total $SIZE)"
echo "backup done: $STAMP (total $SIZE)"
