'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Alert } from '@/components/ui/Alert';
import { ChevronLeft, CheckCircle } from '@/components/icons';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      /* 防枚舉:一律顯示相同成功畫面,不因錯誤洩露 */
    }
    setLoading(false);
    setDone(true);
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-10 bg-surface-container-low">
      <Link
        href="/login"
        className="absolute top-5 left-5 sm:top-7 sm:left-7 inline-flex items-center gap-1 h-10 pl-2.5 pr-4 rounded-full text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors focus-ring"
      >
        <ChevronLeft size={16} />
        返回登入
      </Link>

      <div className="relative w-full max-w-[440px]">
        <div className="flex flex-col items-center mb-8">
          <Logo size={56} />
          <h1 className="mt-4 text-headline text-on-surface">忘記密碼</h1>
          <p className="mt-2 text-body-sm text-on-surface-variant text-center">
            輸入您的帳號 Email,我們將寄送密碼重設連結(1 小時內有效)。
          </p>
        </div>

        <div className="relative bg-surface-container-lowest border border-outline-variant/60 rounded-lg shadow-elev-2 p-7 sm:p-8">
          {done ? (
            <div className="flex flex-col items-center gap-4 text-center py-2">
              <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-50 text-primary-700">
                <CheckCircle size={26} />
              </span>
              <p className="text-body text-on-surface">
                若該 Email 對應到有效帳號,我們已寄出密碼重設連結。請至信箱查收(可能需稍候並檢查垃圾信件匣)。
              </p>
              <Link href="/login">
                <Button variant="tonal">返回登入</Button>
              </Link>
            </div>
          ) : (
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
              <Alert tone="neutral">為保護帳號安全,無論該 Email 是否存在,系統都會顯示相同結果。</Alert>
              <Button type="submit" loading={loading} disabled={!email} fullWidth size="lg">
                寄送重設連結
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
