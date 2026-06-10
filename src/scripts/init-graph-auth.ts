/**
 * Graph delegated 寄信初始化（互動式,跑一次即可）:
 *   npm run graph:init
 *
 * 流程:device code flow → 瀏覽器登入 moecish@m365.ntu.edu.tw 並同意
 * → refresh_token 存到 .graph-token.json(chmod 600)
 * → 之後 src/lib/graph-mail.ts 自動續期,無需再人工介入。
 */
import { writeFile } from 'node:fs/promises';
import { graphMeta } from '../lib/graph-mail';

async function main() {
  const { TENANT_ID, CLIENT_ID, TOKEN_FILE, SCOPE } = graphMeta;

  console.log('[graph:init] 要求 device code...');
  const dcRes = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/devicecode`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE }),
    },
  );
  if (!dcRes.ok) throw new Error(`devicecode failed: ${dcRes.status} ${await dcRes.text()}`);
  const dc = (await dcRes.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval: number;
    expires_in: number;
  };

  console.log('');
  console.log('===== 請完成登入 =====');
  console.log(`瀏覽器開啟: ${dc.verification_uri}`);
  console.log(`輸入代碼:   ${dc.user_code}`);
  console.log('登入帳號:   moecish@m365.ntu.edu.tw');
  console.log('======================');
  console.log('');

  const interval = Math.max(dc.interval ?? 5, 5) * 1000;
  const deadline = Date.now() + dc.expires_in * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    const res = await fetch(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: CLIENT_ID,
          device_code: dc.device_code,
        }),
      },
    );
    const j = (await res.json()) as Record<string, unknown>;
    if (res.ok) {
      const expiresIn = Number(j.expires_in ?? 3600);
      const cache = {
        access_token: String(j.access_token),
        refresh_token: String(j.refresh_token ?? ''),
        expires_at: Date.now() + (expiresIn - 120) * 1000,
      };
      if (!cache.refresh_token) {
        throw new Error('回應缺少 refresh_token — 請確認 app 已要求 offline_access scope');
      }
      await writeFile(TOKEN_FILE, JSON.stringify(cache, null, 2), { mode: 0o600 });
      console.log(`[graph:init] ✓ Token 已存到 ${TOKEN_FILE}`);
      console.log('[graph:init] 寄信功能已啟用。');
      return;
    }
    const err = String(j.error ?? '');
    if (err === 'authorization_pending') { process.stdout.write('.'); continue; }
    if (err === 'slow_down') continue;
    throw new Error(`token error: ${err} ${String(j.error_description ?? '')}`);
  }
  throw new Error('device code 逾時,請重新執行');
}

main().catch((e) => {
  console.error('[graph:init] 失敗:', (e as Error).message);
  process.exit(1);
});
