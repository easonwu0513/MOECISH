'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthLayout } from '@/components/shell/AuthLayout';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Alert } from '@/components/ui/Alert';
import { CheckCircle } from '@/components/icons';

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
    <AuthLayout
      title="忘記密碼"
      subtitle="輸入您的帳號 Email,我們將寄送密碼重設連結(1 小時內有效)。"
      back={{ href: '/login', label: '返回登入' }}
    >
          {done ? (
            <div className="flex flex-col items-center gap-4 text-center py-2">
              <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-50 text-primary-700">
                <CheckCircle size={26} />
              </span>
              <p className="text-body text-ink-900">
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
    </AuthLayout>
  );
}
