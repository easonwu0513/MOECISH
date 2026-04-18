'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SignatureRole } from '@/lib/types';

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
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setErr('檔案超過 10MB 上限');
      e.target.value = '';
      return;
    }
    setErr(null);
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
      setErr(j.error ?? '上傳失敗');
      e.target.value = '';
      return;
    }
    router.refresh();
  }

  const label = signerRole === 'RESPONDENT' ? '填報人' : '單位主管';

  return (
    <div className="bg-white border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{label}簽章文件</h3>
        {existing && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            ✓ 已上傳
          </span>
        )}
      </div>

      <ol className="text-sm text-slate-600 space-y-1 mb-4 list-decimal list-inside">
        <li>下載簽章頁範本</li>
        <li>列印後用印（實體簽章 / 機關印）</li>
        <li>掃描成 PDF、PNG 或 JPG（{'<'} 10MB）</li>
        <li>上傳掃描檔</li>
      </ol>

      <div className="flex flex-wrap gap-2">
        <a
          href={templateUrl}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm rounded-md"
        >
          📄 下載簽章頁範本 (Word)
        </a>
        <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-md">
          <input
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            className="hidden"
            onChange={onChange}
            disabled={uploading}
          />
          {uploading ? '上傳中…' : (existing ? '重新上傳' : '上傳已簽章文件')}
        </label>
        {existing && (
          <a
            href={`/api/signatures/${existing.id}/image`}
            target="_blank"
            rel="noopener"
            className="px-3 py-1.5 text-sm text-brand-600 hover:underline"
          >
            檢視目前版本
          </a>
        )}
      </div>

      {existing && (
        <p className="mt-3 text-xs text-slate-500">
          由 <span className="font-medium">{existing.signerName}</span> 於{' '}
          {new Date(existing.signedAt).toLocaleString('zh-TW')} 上傳
        </p>
      )}

      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  );
}
