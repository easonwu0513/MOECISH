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
    <div className="min-h-screen relative flex items-center justify-center px-4 py-10 overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 20% 30%, rgba(74,125,181,0.12), transparent 60%),' +
            'radial-gradient(ellipse 60% 50% at 80% 70%, rgba(107,139,110,0.10), transparent 60%),' +
            'linear-gradient(180deg, #fbfbf9 0%, #f4f4f0 100%)',
        }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-noise pointer-events-none opacity-50" aria-hidden />

      <div className="relative w-full max-w-[420px]">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative">
            <Logo size={64} />
            <span
              className="absolute -inset-4 -z-10 rounded-full blur-2xl opacity-40"
              style={{ background: 'radial-gradient(closest-side, #4a7db5 0%, transparent 70%)' }}
              aria-hidden
            />
          </div>
          <h1 className="mt-5 text-display-sm text-neutral-900">MOECISH</h1>
          <p className="mt-1.5 text-body-sm text-neutral-500 tracking-wide">
            資通安全稽核管考平台
          </p>
          <p className="mt-5 text-body-sm text-neutral-600 text-center text-balance max-w-[280px] leading-relaxed">
            讓每一次稽核都清楚、從容、留得下軌跡。
          </p>
        </div>

        {/* Card */}
        <div className="relative bg-white/90 backdrop-blur rounded-2xl shadow-lg border border-subtle p-7 sm:p-8">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
                className="flex items-start gap-2 rounded-lg bg-danger-50 border border-danger-100 px-3 py-2.5 text-body-sm text-danger-700 animate-fade-in"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{err}</span>
              </div>
            )}
            <Button type="submit" loading={loading} fullWidth size="lg" className="mt-2">
              登入
            </Button>
          </form>

          <div className="mt-7 pt-6 border-t border-hairline">
            <div className="flex items-center justify-between mb-3">
              <p className="text-label text-neutral-600">快速測試帳號</p>
              <span className="text-caption text-neutral-400">
                密碼 <code className="font-mono text-neutral-600">demo1234</code>
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
                      'group text-left rounded-lg border px-3 py-2.5 transition-all duration-180 ease-smooth focus-ring ' +
                      (isSelected
                        ? 'bg-primary-50 border-primary-200 shadow-xs'
                        : 'bg-white hover:bg-neutral-25 border-subtle hover:border-strong')
                    }
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Chip tone={a.tone} size="sm" dot>{a.label}</Chip>
                    </div>
                    <div className="text-caption font-mono text-neutral-500 truncate">
                      {a.email}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-caption text-neutral-400">
          <Shield size={12} />
          <span>MOECISH · 教育部資通安全稽核改善管考系統</span>
        </div>
      </div>
    </div>
  );
}
