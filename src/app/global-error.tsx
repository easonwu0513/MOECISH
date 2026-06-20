'use client';

/**
 * 根層錯誤邊界。當 root layout 本身渲染失敗時接手,因此必須自帶 <html>/<body>
 * 並取代 root layout — 拿不到 globals.css 與字型 CSS 變數,故全程使用 inline style
 * 與系統字型降級(色值對齊設計 token)。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-Hant">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f6f8fb',
          color: '#0f151e',
          fontFamily: "system-ui, -apple-system, 'Microsoft JhengHei', 'PingFang TC', sans-serif",
          padding: 24,
        }}
      >
        <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 9999,
              background: '#f6d1d0',
              color: '#952a29',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>系統發生嚴重錯誤</h1>
          <p style={{ fontSize: 14, color: '#475060', margin: '0 0 20px', lineHeight: 1.6 }}>
            很抱歉，系統暫時無法顯示此頁。請重新整理，若持續發生請聯絡平台管理員。
          </p>
          <button
            onClick={() => reset()}
            style={{
              height: 40,
              padding: '0 20px',
              borderRadius: 9999,
              border: 'none',
              background: '#2852a0',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            重新整理
          </button>
          {error.digest && (
            <p style={{ fontSize: 12, color: '#475060', marginTop: 16, fontFamily: 'monospace' }}>
              錯誤代碼 {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
