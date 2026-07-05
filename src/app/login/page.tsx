'use client';

import { signIn } from 'next-auth/react';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/shell/AuthLayout';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Chip } from '@/components/ui/Chip';
import { Alert } from '@/components/ui/Alert';
import { AlertCircle, Shield, Eye, EyeOff } from '@/components/icons';

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
    <AuthLayout
      title="MOECISH"
      subtitle="資通安全稽核管考平台"
      back={{ href: '/', label: '回前台網站' }}
      footer={<><Shield size={13} /><span>MOECISH · 資通安全稽核管考平台</span></>}
    >
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
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
