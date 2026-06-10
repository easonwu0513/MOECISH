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

async function getAccessToken(): Promise<string> {
  let cache = await loadCache();
  if (!cache) throw new Error('Graph token 未初始化（請於伺服器執行 npm run graph:init）');
  if (Date.now() >= cache.expires_at) {
    cache = await refreshAccessToken(cache);
  }
  return cache.access_token;
}

/** 以登入帳號（moecish@）身分寄信。失敗丟出例外,由呼叫端決定降級策略。 */
export async function sendGraphMail(input: {
  to: string;
  toName?: string;
  subject: string;
  bodyText: string;
}): Promise<void> {
  const token = await getAccessToken();
  const res = await fetchWithRetry('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: 'Text', content: input.bodyText },
        toRecipients: [
          { emailAddress: { address: input.to, name: input.toName ?? undefined } },
        ],
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok && res.status !== 202) {
    const body = await res.text().catch(() => '');
    throw new Error(`Graph sendMail failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

export const graphMeta = { TENANT_ID, CLIENT_ID, TOKEN_FILE, SCOPE, TOKEN_ENDPOINT };
