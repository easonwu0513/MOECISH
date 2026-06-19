/**
 * Graph token 保活續期(systemd timer 每月執行):
 *   npm run graph:refresh
 * 強制用 refresh_token 換新並輪替保存,重置 90 天閒置視窗;
 * 即使該月無業務信往來,寄信功能也不會因 token 過期而中斷。
 */
import { keepAliveToken, isGraphConfigured } from '../lib/graph-mail';

async function main() {
  if (!(await isGraphConfigured())) {
    console.log('[graph:refresh] token 未初始化,略過(請先 npm run graph:init)');
    return;
  }
  const { upn, expiresAt } = await keepAliveToken();
  console.log(`[graph:refresh] 已續期 ${upn};access_token 有效至 ${new Date(expiresAt).toISOString()}`);
}

main().catch((e) => {
  console.error('[graph:refresh] 續期失敗:', (e as Error).message);
  process.exit(1);
});
