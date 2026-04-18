'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl,
    });
    setLoading(false);
    if (res?.error) {
      setErr('帳號或密碼錯誤');
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  const quickFill = (e: string) => () => {
    setEmail(e);
    setPassword('demo1234');
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-md bg-white shadow-lg rounded-xl p-8">
        <h1 className="text-2xl font-bold text-brand-700">MOECISH</h1>
        <p className="text-slate-500 mt-1 mb-6">資通安全稽核管考系統</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2 rounded-md disabled:opacity-60"
          >
            {loading ? '登入中…' : '登入'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t text-xs text-slate-500">
          <p className="mb-2">測試帳號（密碼皆為 demo1234）：</p>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={quickFill('admin@demo.tw')} className="text-left hover:text-brand-600">admin@demo.tw</button>
            <button onClick={quickFill('auditor@demo.tw')} className="text-left hover:text-brand-600">auditor@demo.tw</button>
            <button onClick={quickFill('respondent@demo.tw')} className="text-left hover:text-brand-600">respondent@demo.tw</button>
            <button onClick={quickFill('supervisor@demo.tw')} className="text-left hover:text-brand-600">supervisor@demo.tw</button>
          </div>
        </div>
      </div>
    </div>
  );
}
