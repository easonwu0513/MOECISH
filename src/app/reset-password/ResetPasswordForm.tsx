'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Alert } from '@/components/ui/Alert';
import { AlertCircle, CheckCircle, Eye, EyeOff } from '@/components/icons';

export default function ResetPasswordForm({ token }: { token: string }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) return setErr('新密碼至少 8 字元');
    if (pw !== pw2) return setErr('兩次輸入的密碼不一致');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password: pw }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: '重設失敗' }));
        setLoading(false);
        return setErr(j.error ?? '重設失敗,請稍後再試');
      }
      setDone(true);
    } catch {
      setLoading(false);
      setErr('連線逾時或網路中斷,請稍後再試');
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-2">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success-50 text-success-700">
          <CheckCircle size={26} />
        </span>
        <p className="text-body text-ink-900">密碼已重設完成,請以新密碼登入。</p>
        <Link href="/login">
          <Button variant="filled">前往登入</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <TextField
        label="新密碼(至少 8 字元)"
        type={show ? 'text' : 'password'}
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        required
        autoFocus
        autoComplete="new-password"
        trailingIcon={
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="relative inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-500 hover:text-ink-900 hover:bg-paper-sunk transition-colors focus-ring before:absolute before:content-[''] before:-inset-1.5"
            aria-label={show ? '隱藏密碼' : '顯示密碼'}
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        }
      />
      <TextField
        label="再次輸入新密碼"
        type={show ? 'text' : 'password'}
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
        required
        autoComplete="new-password"
      />
      {err && <Alert tone="danger" role="alert" icon={<AlertCircle size={18} />}>{err}</Alert>}
      <Button type="submit" loading={loading} disabled={!pw || !pw2} fullWidth size="lg">
        設定新密碼
      </Button>
    </form>
  );
}
