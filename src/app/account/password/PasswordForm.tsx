'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';

export default function PasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error('兩次輸入的新密碼不一致');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '變更失敗' }));
      toast.error('變更失敗', j.error);
      return;
    }
    toast.success('密碼已變更', '下次登入請使用新密碼。');
    setCurrent(''); setNext(''); setConfirm('');
  }

  return (
    <Card className="max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="目前密碼"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
        <TextField
          label="新密碼"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          required
        />
        <TextField
          label="確認新密碼"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
        <div className="flex justify-end">
          <Button type="submit" loading={busy}>變更密碼</Button>
        </div>
      </form>
    </Card>
  );
}
