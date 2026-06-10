'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { TOAST } from '@/lib/copy';

export default function ReviewPanel({
  deficiencyId,
  round,
}: {
  deficiencyId: string;
  round: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<'PASS' | 'RETURN' | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  async function decide() {
    if (!open) return;
    if (open === 'RETURN' && !comment.trim()) {
      toast.error('請填寫退回理由', '退回補正必須附說明');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/deficiencies/${deficiencyId}/action/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: open, comment: comment.trim() || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '審查失敗' }));
      toast.error('審查失敗', j.error);
      return;
    }
    const t = open === 'PASS' ? TOAST.passedAction() : TOAST.returnedAction();
    toast.success(t.title, t.description);
    setOpen(null);
    setComment('');
    router.refresh();
  }

  return (
    <Card className="mb-6" variant="elevated">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>委員審查（第 {round} 輪）</CardTitle>
          <CardDescription>
            檢視下方機關填報內容與佐證後，決定本項矯正措施是否通過。
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="tonal" onClick={() => setOpen('RETURN')}>退回補正</Button>
          <Button onClick={() => setOpen('PASS')}>審核通過</Button>
        </div>
      </div>

      <ConfirmDialog
        open={open === 'PASS'}
        onOpenChange={(o) => !saving && !o && setOpen(null)}
        title="審核通過"
        description={
          <div className="mt-2 flex flex-col gap-3">
            <p className="text-body-sm text-on-surface-variant">確認本項矯正措施已符合要求？</p>
            <Textarea
              label="審查意見（選填）"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
          </div>
        }
        confirmLabel="通過"
        tone="primary"
        onConfirm={decide}
        loading={saving}
      />
      <ConfirmDialog
        open={open === 'RETURN'}
        onOpenChange={(o) => !saving && !o && setOpen(null)}
        title="退回補正"
        description={
          <div className="mt-2">
            <Textarea
              label="退回理由（必填）"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="例：佐證文件不足，請補附設定變更紀錄與留存驗證畫面…"
            />
          </div>
        }
        confirmLabel="退回"
        tone="danger"
        onConfirm={decide}
        loading={saving}
      />
    </Card>
  );
}
