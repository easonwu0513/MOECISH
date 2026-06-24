#!/bin/bash
# ════════════════════════════════════════════════════════════════
# MOECISH 部署閘(pre-deploy gate)
#
# build → 以臨時實例跑跨機關隔離測試(test:isolation,26+ 斷言)→
# 「通過才切換正式服務」。隔離測試失敗即拒絕上線並寄警報,
# 避免授權/租戶隔離回歸被部署到正式環境。
#
# 用法(於 VM,具 systemctl moecish 權限者):
#   sudo bash /srv/moecish/infra/redeploy-gate.sh
#
# 設計:臨時實例與正式服務共用同一份 .next 產物,於 GATE_PORT 起一個
# `next start` 做隔離測試;測試自建並自清夾具,通過後才 restart 正式服務。
# ════════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR=${APP_DIR:-/srv/moecish}
GATE_PORT=${GATE_PORT:-3999}
PROD_PORT=${PROD_PORT:-3001}

cd "$APP_DIR"
set -a; . ./.env; set +a

echo "[gate] (1/4) 安裝相依 + 產生 client + 推進 schema + build"
npm install --no-audit --no-fund 2>&1 | tail -3
npx prisma generate 2>&1 | tail -1
npx prisma db push --skip-generate 2>&1 | tail -2
npm run build 2>&1 | tail -3

echo "[gate] (2/4) 啟動臨時實例於 :$GATE_PORT 做隔離測試"
PORT=$GATE_PORT npm run start >/tmp/moecish-gate-instance.log 2>&1 &
GATE_PID=$!
cleanup() { kill "$GATE_PID" 2>/dev/null || true; wait "$GATE_PID" 2>/dev/null || true; }
trap cleanup EXIT

ready=0
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$GATE_PORT/api/version" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "[gate] ✗ 臨時實例未能就緒,中止部署"
  exit 1
fi

echo "[gate] (3/4) 執行跨機關隔離測試"
set +e
BASE_URL="http://127.0.0.1:$GATE_PORT" npm run test:isolation
GATE_RESULT=$?
set -e

if [ "$GATE_RESULT" -ne 0 ]; then
  echo "[gate] ✗ 跨機關隔離測試未通過 — 拒絕切換正式服務(正式服務維持舊版)"
  npx tsx src/scripts/send-alert.ts \
    "[MOECISH] 部署閘擋下:跨機關隔離測試失敗" \
    "redeploy-gate 偵測到跨機關隔離測試未通過,已拒絕切換正式服務,正式環境維持前一版。請檢查 lib/rbac 授權邏輯與最近變更後重試。" \
    || true
  exit 1
fi

echo "[gate] (4/4) ✓ 隔離測試通過 — 切換正式服務"
cleanup
trap - EXIT
systemctl restart moecish
sleep 6
if curl -sf "http://127.0.0.1:$PROD_PORT/api/version" >/dev/null 2>&1; then
  echo "[gate] ✓ 部署完成,正式服務已就緒:$(curl -s http://127.0.0.1:$PROD_PORT/api/version)"
else
  echo "[gate] ✗ 正式服務重啟後未就緒,請立即檢查 journalctl -u moecish"
  exit 1
fi
