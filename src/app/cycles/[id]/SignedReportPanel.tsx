'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { Upload, FileText, Check } from '@/components/icons';

type Item = {
  id: string;
  fileName: string;
  uploadedAt: string;
  confirmedAt: string | null;
};

export default function SignedReportPanel({
  cycleId,
  role,
}: {
  cycleId: string;
  role: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/cycles/${cycleId}/signed-reports`);
    if (!res.ok) return;
    const j = await res.json();
    setItems(j.items ?? []);
  }
  useEffect(() => { load(); }, [cycleId]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch(`/api/cycles/${cycleId}/signed-reports`, { method: 'POST', body: fd });
    setBusy(false);
    if (res.ok) {
      toast.success('已上傳用印掃描檔', f.name);
      await load();
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '上傳失敗' }));
      toast.error('上傳失敗', j.error);
    }
    e.target.value = '';
  }

  async function confirm(reportId: string) {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/signed-reports?reportId=${reportId}`, {
      method: 'PATCH',
    });
    setBusy(false);
    if (res.ok) {
      toast.success('已確認用印掃描檔', '可進行結案。');
      await load();
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '確認失敗' }));
      toast.error('確認失敗', j.error);
    }
  }

  const canUpload = role === 'ORG_ADMIN' || role === 'SUPER_ADMIN';
  const canConfirm = role === 'SUPER_ADMIN';

  return (
    <Card className="mb-6">
      <CardTitle>用印掃描檔</CardTitle>
      <CardDescription>
        全數缺失審核通過後，請列印改善報告、機關用印，並將掃描檔（PDF / 圖片）上傳；
        經最高管理員確認後方可結案。
      </CardDescription>

      <div className="mt-4 flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">尚未上傳</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 rounded-md border border-outline-variant px-4 py-3">
                <FileText size={18} className="text-on-surface-variant shrink-0" />
                <div className="flex-1 min-w-0">
                  <a
                    href={`/api/signed-reports/${it.id}/download`}
                    className="text-body-sm text-primary-700 hover:underline truncate block"
                  >
                    {it.fileName}
                  </a>
                  <p className="text-caption text-on-surface-variant">
                    {new Date(it.uploadedAt).toLocaleString('zh-TW')}
                  </p>
                </div>
                {it.confirmedAt ? (
                  <Chip tone="success" size="sm" dot>已確認</Chip>
                ) : canConfirm ? (
                  <Button size="sm" variant="tonal" onClick={() => confirm(it.id)} loading={busy} leadingIcon={<Check size={14} />}>
                    確認
                  </Button>
                ) : (
                  <Chip tone="neutral" size="sm">待確認</Chip>
                )}
              </li>
            ))}
          </ul>
        )}

        {canUpload && (
          <label className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-surface border border-dashed border-primary-400 text-primary-700 hover:bg-primary-50 cursor-pointer focus-ring transition-colors w-fit">
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={upload} disabled={busy} />
            <Upload size={14} />
            <span className="text-body-sm">{busy ? '處理中…' : '+ 上傳掃描檔'}</span>
          </label>
        )}
      </div>
    </Card>
  );
}
