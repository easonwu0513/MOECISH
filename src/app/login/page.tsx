'use client';

import { signIn } from 'next-auth/react';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Chip } from '@/components/ui/Chip';
import { Alert } from '@/components/ui/Alert';
import { AlertCircle, ChevronLeft, Shield, Eye, EyeOff } from '@/components/icons';

const demoAccounts = [
  { email: 'admin@demo.tw',   label: '最高管理員', tone: 'primary' as const },
  { email: 'auditor@demo.tw', label: '稽核委員',   tone: 'sage' as const },
  { email: 'org@demo.tw',     label: '機關管理員', tone: 'warning' as const },
  { email: 'org2@demo.tw',    label: '機關管理員 B', tone: 'neutral' as const },
];

// UAT 顯示測試帳號;正式環境(未設旗標)一律不顯示,預設欄位留空
const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === '1';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/dashboard';
  const [email, setEmail] = useState(SHOW_DEMO ? 'org@demo.tw' : '');
  const [password, setPassword] = useState(SHOW_DEMO ? 'demo1234' : '');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await signIn('credentials', { email, password, redirect: false, callbackUrl });
    if (res?.error) {
      setLoading(false);
      // 防護基準啟用時 authorize 以 throw 回報特定狀態
      if (res.error.includes('AccountLocked')) {
        return setErr('帳號已暫時鎖定(連續驗證失敗達上限),請 15 分鐘後再試');
      }
      if (res.error.includes('TooManyAttempts')) {
        return setErr('嘗試次數過多,請稍後再試');
      }
      return setErr('帳號或密碼錯誤，請再試一次');
    }
    // 成功:維持 loading 直到頁面轉走,避免按鈕提前復原被重複點
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-10 overflow-hidden bg-surface-container-low">
      {/* Ambient — navy gradient(單一來源 --auth-ambient,以現行 primary-600 為基;批72) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'var(--auth-ambient)' }}
        aria-hidden
      />

      {/* 回前台 */}
      <Link
        href="/"
        className="absolute top-5 left-5 sm:top-7 sm:left-7 inline-flex items-center gap-1 h-10 pl-2.5 pr-4 rounded-full text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors duration-200 ease-standard focus-ring"
      >
        <ChevronLeft size={16} />
        回前台網站
      </Link>

      <div className="relative w-full max-w-[440px]">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <Logo size={64} />
          <h1 className="mt-5 text-headline-lg text-on-surface">MOECISH</h1>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            資通安全稽核管考平台
          </p>
        </div>

        {/* Card — elevated(白底浮起,與頁面背景拉開層級) */}
        <div className="relative bg-surface-container-lowest border border-outline-variant/60 rounded-lg shadow-elev-2 p-7 sm:p-8">
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
            />
            <TextField
              label="密碼"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              trailingIcon={
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="relative inline-flex items-center justify-center w-8 h-8 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors focus-ring before:absolute before:content-[''] before:-inset-1.5"
                  aria-label={showPw ? '隱藏密碼' : '顯示密碼'}
                >
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              }
            />
            {err && (
              <Alert tone="danger" role="alert" icon={<AlertCircle size={18} />}>{err}</Alert>
            )}
            <Button type="submit" loading={loading} fullWidth size="lg" className="mt-2">
              登入
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/forgot-password" className="text-body-sm text-primary-700 hover:underline focus-ring rounded px-1 py-0.5">
              忘記密碼?
            </Link>
          </div>

          {SHOW_DEMO && (
          <div className="mt-7 pt-6 border-t border-outline-variant">
            <div className="flex items-center justify-between mb-3">
              <p className="text-label-lg text-on-surface-variant">快速測試帳號</p>
              <span className="text-caption text-on-surface-variant">
                演示密碼 <code className="font-mono">demo1234</code>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((a) => {
                const isSelected = email === a.email;
                return (
                  <button
                    key={a.email}
                    type="button"
                    onClick={() => { setEmail(a.email); setPassword('demo1234'); }}
                    className={
                      'group text-left rounded-sm px-3.5 py-2.5 transition-colors duration-200 ease-standard focus-ring ' +
                      (isSelected
                        ? 'bg-primary-container text-on-primary-container'
                        : 'bg-surface-container hover:bg-surface-container-high')
                    }
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Chip tone={a.tone} size="sm" dot>{a.label}</Chip>
                    </div>
                    <div className="text-caption font-mono text-on-surface-variant truncate">
                      {a.email}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-caption text-on-surface-variant">
          <Shield size={13} />
          <span>MOECISH · 資通安全稽核管考平台</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
