// 全站安全標頭(基線)。CSP 需逐頁調校 inline script/style,另案處理,此處先補低風險者。
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },                 // 防點擊劫持
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // HSTS 僅於 HTTPS 連線生效(HTTP 下瀏覽器忽略),預先佈署待 443 開通即生效
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
    // 原生套件不可由 webpack 打包(含 .node 二進位);浮水印圖片用
    serverComponentsExternalPackages: ['@napi-rs/canvas'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
