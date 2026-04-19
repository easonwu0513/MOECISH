'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Chip } from '@/components/ui/Chip';
import { AlertCircle, Shield } from '@/components/icons';

const demoAccounts = [
  { email: 'admin@demo.tw',      label: '平台管理員', tone: 'primary' as const },
  { email: 'auditor@demo.tw',    label: '稽核委員',   tone: 'sage' as const },
  { email: 'respondent@demo.tw', label: '填報人',     tone: 'neutral' as const },
  { email: 'supervisor@demo.tw', label: '單位主管',   tone: 'warning' as const },
];

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';
  const [email, setEmail] = useState('respondent@demo.tw');
  const [password, setPassword] = useState('demo1234');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await signIn('credentials', { email, password, redirect: false, callbackUrl });
    setLoading(false);
    if (res?.error) return setErr('帳號或密碼錯誤，請再試一次');
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-10 overflow-hidden bg-surface-container-low">
      {/* Ambient — navy gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 65% 55% at 15% 20%, rgba(40,82,160,0.12), transparent 70%),' +
            'radial-gradient(ellipse 60% 50% at 85% 85%, rgba(40,82,160,0.06), transparent 70%)',
        }}
        aria-hidden
      />

      <div className="relative w-full max-w-[440px]">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <Logo size={64} />
          <h1 className="mt-5 text-headline-lg text-on-surface">MOECISH</h1>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            資通安全稽核管考平台
          </p>
        </div>

        {/* Card — elevated */}
        <div className="relative bg-surface-container-low rounded-lg shadow-elev-1 p-7 sm:p-8">
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
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            {err && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-sm bg-danger-50 text-danger-700 px-3 py-2.5 text-body-sm animate-fade-in"
              >
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{err}</span>
              </div>
            )}
            <Button type="submit" loading={loading} fullWidth size="lg" className="mt-2">
              登入
            </Button>
          </form>

          <div className="mt-7 pt-6 border-t border-outline-variant">
            <div className="flex items-center justify-between mb-3">
              <p className="text-label-lg text-on-surface-variant">快速測試帳號</p>
              <span className="text-caption text-on-surface-variant">
                密碼 <code className="font-mono">demo1234</code>
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
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-caption text-on-surface-variant">
          <Shield size={13} />
          <span>MOECISH · 教育部資通安全稽核改善管考系統</span>
        </div>
      </div>
    </div>
  );
}
