'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SignatureRole } from '@/lib/types';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { Download, Upload, Eye, CheckCircle } from '@/components/icons';

export default function SignedDocumentUpload({
  cycleId,
  signerRole,
  existing,
  templateUrl,
}: {
  cycleId: string;
  signerRole: SignatureRole;
  existing?: { id: string; signerName: string; signedAt: Date };
  templateUrl: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast.error('上傳失敗', '檔案超過 10MB 上限');
      e.target.value = '';
      return;
    }
    const fd = new FormData();
    fd.append('file', f);
    fd.append('signerRole', signerRole);
    setUploading(true);
    const res = await fetch(`/api/cycles/${cycleId}/signatures`, {
      method: 'POST',
      body: fd,
    });
    setUploading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '上傳失敗' }));
      toast.error('上傳失敗', j.error);
      e.target.value = '';
      return;
    }
    toast.success('已上傳簽章文件', '系統已記錄上傳時間、IP 與檔案雜湊。');
    router.refresh();
  }

  const label = signerRole === 'RESPONDENT' ? '填報人' : '單位主管';

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle>{label}簽章文件</CardTitle>
          <CardDescription>下載範本 → 列印蓋章 → 掃描後上傳</CardDescription>
        </div>
        {existing && (
          <Chip tone="success" icon={<CheckCircle size={14} />}>已上傳</Chip>
        )}
      </div>

      <ol className="mt-4 flex flex-col sm:flex-row gap-3 text-body-sm text-neutral-600">
        {['下載簽章頁範本 (Word)', '列印後用印（實體簽章 / 機關印）', '掃描為 PDF / PNG / JPG (<10MB)', '上傳掃描檔'].map((s, i) => (
          <li key={i} className="flex-1 flex items-start gap-2">
            <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center text-caption font-semibold">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex flex-wrap gap-2">
        <a href={templateUrl}>
          <Button variant="secondary" leadingIcon={<Download size={16} />}>
            下載簽章頁範本
          </Button>
        </a>
        <label
          className="inline-flex items-center gap-2 h-10 px-4 text-body font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white cursor-pointer focus-ring shadow-xs transition-colors disabled:opacity-60"
          aria-disabled={uploading}
        >
          <input
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            className="hidden"
            onChange={onChange}
            disabled={uploading}
          />
          <Upload size={16} />
          <span>{uploading ? '上傳中…' : existing ? '重新上傳' : '上傳已簽章文件'}</span>
        </label>
        {existing && (
          <a href={`/api/signatures/${existing.id}/image`} target="_blank" rel="noopener">
            <Button variant="ghost" leadingIcon={<Eye size={16} />}>
              檢視目前版本
            </Button>
          </a>
        )}
      </div>

      {existing && (
        <p className="mt-3 text-caption text-neutral-500">
          由 <span className="font-medium text-neutral-700">{existing.signerName}</span> 於{' '}
          {new Date(existing.signedAt).toLocaleString('zh-TW')} 上傳
        </p>
      )}
    </Card>
  );
}
