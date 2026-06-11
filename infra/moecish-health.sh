#!/bin/bash
# MOECISH 輕量健康監控(systemd timer 每 5 分鐘執行,root 身分):
#   1. moecish 服務 + HTTP 回應 → 異常先自動重啟(自癒),仍異常才告警
#   2. 磁碟使用率 >= 90% 告警
#   3. PostgreSQL 無回應告警
# 告警經 Graph 寄到 moecish@m365.ntu.edu.tw,同類問題 1 小時內不重複寄;
# 恢復正常時補一封「已恢復」。安裝:cp 到 /usr/local/bin/ + enable timer。

APP_URL="http://127.0.0.1:3001/login"
STATE_DIR="/var/lib/moecish-health"
THROTTLE_SECS=3600
HOST_TAG="$(hostname) ($(hostname -I 2>/dev/null | awk '{print $1}'))"

mkdir -p "$STATE_DIR"
PROBLEMS=()
NOTES=()

# ── 1. 服務 + HTTP(含自癒)──────────────────
svc=$(systemctl is-active moecish 2>/dev/null)
code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$APP_URL" 2>/dev/null)
if [ "$svc" != "active" ] || [ "$code" != "200" ]; then
  logger -t moecish-health "app unhealthy (svc=$svc http=$code) — restarting"
  systemctl restart moecish
  sleep 8
  svc2=$(systemctl is-active moecish 2>/dev/null)
  code2=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$APP_URL" 2>/dev/null)
  if [ "$svc2" != "active" ] || [ "$code2" != "200" ]; then
    PROBLEMS+=("網站服務異常:自動重啟後仍 service=$svc2 / HTTP $code2(重啟前 $svc / $code)")
  else
    NOTES+=("網站曾異常(service=$svc / HTTP $code),已自動重啟恢復")
  fi
fi

# ── 2. 磁碟 ──────────────────────────────────
disk=$(df --output=pcent / 2>/dev/null | tail -1 | tr -dc '0-9')
if [ -n "$disk" ] && [ "$disk" -ge 90 ]; then
  PROBLEMS+=("磁碟使用率 ${disk}%(/),請清理或擴容")
fi

# ── 3. PostgreSQL ───────────────────────────
if ! runuser -u postgres -- pg_isready -q 2>/dev/null; then
  PROBLEMS+=("PostgreSQL 無回應(pg_isready 失敗)")
fi

# ── 告警/恢復(1 小時節流)────────────────────
send_mail() {
  local subject="$1" body="$2"
  runuser -u moecish -- bash -c \
    "cd /srv/moecish && npx tsx src/scripts/send-alert.ts \"\$0\" \"\$1\"" \
    "$subject" "$body" \
    || logger -t moecish-health "alert mail failed: $subject"
}

MARKER="$STATE_DIR/alerting"
now=$(date +%s)

if [ ${#PROBLEMS[@]} -gt 0 ] || [ ${#NOTES[@]} -gt 0 ]; then
  body="MOECISH 健康監控於 $(date '+%Y-%m-%d %H:%M:%S') 偵測:

$(printf '• %s\n' "${PROBLEMS[@]}" "${NOTES[@]}")

主機:$HOST_TAG
(同類警報 1 小時內不重複;服務異常會先嘗試自動重啟)"

  if [ ${#PROBLEMS[@]} -gt 0 ]; then
    subject="[MOECISH][警報] 系統健康異常(${#PROBLEMS[@]} 項)"
  else
    subject="[MOECISH][已自癒] 服務曾異常,已自動重啟恢復"
  fi

  last=$(cat "$MARKER" 2>/dev/null || echo 0)
  if [ $((now - last)) -ge $THROTTLE_SECS ]; then
    send_mail "$subject" "$body"
    echo "$now" > "$MARKER"
    logger -t moecish-health "alert sent: $subject"
  else
    logger -t moecish-health "alert throttled: $subject"
  fi
else
  # 全綠:若先前在告警狀態,補恢復通知
  if [ -f "$MARKER" ]; then
    send_mail "[MOECISH][恢復] 系統健康檢查全數通過" \
      "MOECISH 於 $(date '+%Y-%m-%d %H:%M:%S') 檢查全數通過(服務/HTTP/磁碟/資料庫)。主機:$HOST_TAG"
    rm -f "$MARKER"
    logger -t moecish-health "recovery mail sent"
  fi
fi

exit 0
