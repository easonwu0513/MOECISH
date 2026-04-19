'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { AlertCircle } from '@/components/icons';

export default function InviteAcceptForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) return setErr('密碼至少 8 個字元');
    if (password !== confirm) return setErr('兩次密碼不一致');

    setLoading(true);
    const res = await fetch(`/api/invite/${token}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setLoading(false);
      const j = await res.json().catch(() => ({ error: '接受邀請失敗' }));
      setErr(j.error ?? '接受邀請失敗');
      return;
    }

    // Auto-login
    const loginRes = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl: '/',
    });
    setLoading(false);
    if (loginRes?.error) {
      setErr('帳號已建立，但自動登入失敗。請手動登入。');
      setTimeout(() => router.push('/login'), 1500);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TextField
        label="Email"
        value={email}
        disabled
      />
      <TextField
        label="設定密碼（至少 8 字元）"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoFocus
      />
      <TextField
        label="再次輸入密碼"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
      />
      {err && (
        <div className="flex items-start gap-2 rounded-md bg-danger-50 text-danger-700 px-3 py-2.5 text-body-sm animate-fade-in">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}
      <Button type="submit" loading={loading} fullWidth size="lg">
        啟用帳號並登入
      </Button>
    </form>
  );
}
