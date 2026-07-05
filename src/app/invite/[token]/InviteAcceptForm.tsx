'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Alert } from '@/components/ui/Alert';
import { AlertCircle, Eye, EyeOff } from '@/components/icons';

export default function InviteAcceptForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // 密碼顯示/隱藏切換鈕(與 login/reset 一致;批77 補齊 invite 缺的 affordance)
  const pwToggle = (
    <button
      type="button"
      onClick={() => setShowPw((v) => !v)}
      className="relative inline-flex items-center justify-center w-8 h-8 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors focus-ring before:absolute before:content-[''] before:-inset-1.5"
      aria-label={showPw ? '隱藏密碼' : '顯示密碼'}
    >
      {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
    </button>
  );

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
    <form onSubmit={submit} className="flex flex-col gap-5">
      <TextField
        label="Email"
        value={email}
        disabled
      />
      <TextField
        label="設定密碼（至少 8 字元）"
        type={showPw ? 'text' : 'password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoFocus
        autoComplete="new-password"
        trailingIcon={pwToggle}
      />
      <TextField
        label="再次輸入密碼"
        type={showPw ? 'text' : 'password'}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        autoComplete="new-password"
        trailingIcon={pwToggle}
      />
      {err && (
        <Alert tone="danger" role="alert" icon={<AlertCircle size={18} />}>{err}</Alert>
      )}
      <Button type="submit" loading={loading} fullWidth size="lg">
        啟用帳號並登入
      </Button>
    </form>
  );
}
