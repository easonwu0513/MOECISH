import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * 全域認證閘(縱深防禦補位):所有非公開路徑一律要求「已登入」(有效 JWT session)。
 * ⚠️ 這是「認證」補位,不取代各 route 既有的「授權」(角色/租戶)自律 —— access-policy.ts 檔頭自述
 * 「無 middleware,漏一處即破口」的根因即補於此:即使某 route 忘了加登入檢查,middleware 仍先擋下匿名。
 * 同時為每個請求加 x-request-id(供日誌關聯與問題追蹤)。
 *
 * 公開(映象前台 Portal + 認證入口):首頁 / 、新聞、隱私/條款/著作權、登入/忘記密碼/重設/邀請、
 * NextAuth(/api/auth/*)、版本與健康檢查端點。其餘(/dashboard、/cycles、/admin、/account、
 * /journey 及絕大多數 /api/*)皆需登入。
 */
const PUBLIC_EXACT = new Set([
  '/', '/login', '/forgot-password', '/reset-password', '/privacy', '/terms', '/copyright', '/news',
  '/api/version', '/api/health',
]);
// 皆帶邊界(尾斜線),避免 startsWith 把未來的 /news-internal 之類誤判為公開(對抗審查 F4)。
// /api/invite/ = 邀請啟用流程(建立帳號,無 session;端點自帶 token 驗證)——漏此則新用戶 onboarding 全 401(F1)。
// /api/post-attachments/ = 公告附件/內文圖片(前台公告為公開頁;批33 圖4:漏此則匿名訪客圖片與附件全 401)
// ——路由本體已自帶授權(已發布=公開、草稿/下架=僅中心),此處僅放行「認證」層。
const PUBLIC_PREFIX = ['/news/', '/invite/', '/api/auth/', '/api/invite/', '/api/post-attachments/'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIX.some((p) => pathname.startsWith(p));
}

// 反代情境下的 cookie 名(https → __Secure- 前綴):依 NEXTAUTH_URL 判定,與 getToken 預設一致。
const useSecureCookie = (process.env.NEXTAUTH_URL ?? '').startsWith('https://');

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  const withId = () => {
    const h = new Headers(req.headers);
    h.set('x-request-id', requestId);
    const res = NextResponse.next({ request: { headers: h } });
    res.headers.set('x-request-id', requestId);
    return res;
  };

  if (isPublic(pathname)) return withId();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET, secureCookie: useSecureCookie });
  if (!token) {
    if (pathname.startsWith('/api/')) {
      const res = NextResponse.json({ error: '未登入' }, { status: 401 });
      res.headers.set('x-request-id', requestId);
      return res;
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('callbackUrl', pathname + search);
    const res = NextResponse.redirect(url);
    res.headers.set('x-request-id', requestId);
    return res;
  }

  return withId();
}

export const config = {
  // 靜態資產與 Next 內部不進 middleware;其餘全數經過(含頁面與 API)。
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|.*\\.(?:png|jpe?g|svg|gif|ico|webp|txt|xml|woff2?)$).*)'],
};
