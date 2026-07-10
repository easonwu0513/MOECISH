'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';

/** 中心指派本缺失的審閱委員(只能從相關開立委員中選;可清除)。 */
export default function ReviewerAssign({
  deficiencyId,
  authors,
  current,
}: {
  deficiencyId: string;
  authors: { id: string; name: string }[];
  current: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pick, setPick] = useState(current ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/deficiencies/${deficiencyId}/reviewer`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ auditorId: pick || null }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '指派失敗' }));
      toast.error('指派失敗', j.error);
      return;
    }
    toast.success('已更新審閱委員');
    router.refresh();
  }

  if (authors.length === 0) {
    return <p className="text-body-sm text-ink-500">此缺失查無對應的開立委員，無法指派審閱委員。</p>;
  }

  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div className="w-60 max-w-full">
        <Select label="審閱委員（參與此次稽核的委員）" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">未指派</option>
          {authors.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </div>
      <Button variant="tonal" onClick={save} loading={busy} disabled={pick === (current ?? '')}>
        儲存指派
      </Button>
    </div>
  );
}
