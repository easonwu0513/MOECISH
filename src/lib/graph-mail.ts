import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Microsoft Graph delegated 寄信（/me/sendMail）。
 *
 * 模式:device code flow 取得之 refresh_token 存於 token 檔,
 * 由 `npm run graph:init`（scripts/init-graph-auth.ts）互動式初始化一次,
 * 之後本模組自動用 refresh_token 換新 access_token(並輪替保存)。
 *
 * 若 token 檔不存在 → isGraphConfigured() = false,呼叫端應降級為僅記錄。
 */

const TENANT_ID = process.env.AZURE_TENANT_ID ?? '6b31b077-bf78-4fa8-bd42-7c0d7d2a3c04';
const CLIENT_ID = process.env.AZURE_CLIENT_ID ?? '2e10e829-17bd-41d2-bb48-6d3c4e83aba6';
const TOKEN_FILE =
  process.env.GRAPH_TOKEN_FILE ?? path.join(process.cwd(), '.graph-token.json');

const TOKEN_ENDPOINT = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const SCOPE = 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access';

type TokenCache = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
  upn?: string;
};

let memCache: TokenCache | null = null;

/** 網路層重試(undici 偶發 'fetch failed',如 NAT 環境 IPv6 解析失敗) */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  tries = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1) * 2));
    }
  }
  throw lastErr;
}

async function loadCache(): Promise<TokenCache | null> {
  if (memCache) return memCache;
  try {
    const raw = await readFile(TOKEN_FILE, 'utf-8');
    memCache = JSON.parse(raw) as TokenCache;
    return memCache;
  } catch {
    return null;
  }
}

async function saveCache(cache: TokenCache): Promise<void> {
  memCache = cache;
  await writeFile(TOKEN_FILE, JSON.stringify(cache, null, 2), { mode: 0o600 });
}

export async function isGraphConfigured(): Promise<boolean> {
  return (await loadCache()) !== null;
}

async function refreshAccessToken(cache: TokenCache): Promise<TokenCache> {
  const res = await fetchWithRetry(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: cache.refresh_token,
      scope: SCOPE,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Graph token refresh failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const j = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const next: TokenCache = {
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? cache.refresh_token, // MS 會輪替,沒給就沿用
    expires_at: Date.now() + (j.expires_in - 120) * 1000,
    upn: cache.upn,
  };
  await saveCache(next);
  return next;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  let cache = await loadCache();
  if (!cache) throw new Error('Graph token 未初始化（請於伺服器執行 npm run graph:init）');
  if (forceRefresh || Date.now() >= cache.expires_at) {
    cache = await refreshAccessToken(cache);
  }
  return cache.access_token;
}

/**
 * 強制以 refresh_token 續期並輪替保存,重置 90 天閒置視窗。
 * 供排程定期呼叫(即使無業務信往來,token 也不會過期失效)。
 */
export async function keepAliveToken(): Promise<{ upn: string; expiresAt: number }> {
  const cache = await loadCache();
  if (!cache) throw new Error('Graph token 未初始化（請於伺服器執行 npm run graph:init）');
  const next = await refreshAccessToken(cache);
  return { upn: next.upn ?? 'moecish@m365.ntu.edu.tw', expiresAt: next.expires_at };
}

/** HTTP 層暫時性失敗的重試上限(含首次共 4 次);永久性 4xx(如 400 內容錯誤)不重試。 */
const SEND_MAX_ATTEMPTS = 4;

/**
 * 以登入帳號（moecish@）身分寄信。
 * 韌性:除既有網路層 fetchWithRetry 外,再對 HTTP 暫時性失敗退避重試 ——
 *  - 401:token 在效期內被撤銷/提前失效 → 強制以 refresh_token 換新後重試(常見漏信主因);
 *  - 429 / 5xx:節流或服務暫時不穩 → 尊重 Retry-After,否則指數退避 1s→2s→4s;
 *  - 其他 4xx:永久性錯誤,立即丟出不重試。
 * 全部嘗試仍失敗才丟例外,由呼叫端(sendEmail)記為 failed。
 */
export async function sendGraphMail(input: {
  to: string;
  toName?: string;
  subject: string;
  bodyText: string;
}): Promise<void> {
  const payload = JSON.stringify({
    message: {
      subject: input.subject,
      body: { contentType: 'Text', content: input.bodyText },
      toRecipients: [
        { emailAddress: { address: input.to, name: input.toName ?? undefined } },
      ],
    },
    saveToSentItems: true,
  });

  let lastError = 'Graph sendMail failed';
  let force401Refresh = false;
  for (let attempt = 0; attempt < SEND_MAX_ATTEMPTS; attempt++) {
    const token = await getAccessToken(force401Refresh);
    const res = await fetchWithRetry('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: payload,
    });
    if (res.ok || res.status === 202) return; // 寄出成功

    const status = res.status;
    const body = await res.text().catch(() => '');
    lastError = `Graph sendMail failed (${status}): ${body.slice(0, 300)}`;

    const transient = status === 401 || status === 429 || status >= 500;
    if (!transient || attempt === SEND_MAX_ATTEMPTS - 1) throw new Error(lastError);

    force401Refresh = status === 401; // 下一輪強制換 token
    const retryAfter = Number(res.headers.get('retry-after'));
    const backoffMs = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, backoffMs));
  }
  throw new Error(lastError);
}

export const graphMeta = { TENANT_ID, CLIENT_ID, TOKEN_FILE, SCOPE, TOKEN_ENDPOINT };
