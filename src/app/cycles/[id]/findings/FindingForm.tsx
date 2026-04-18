'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FINDING_ASPECTS,
  FINDING_ASPECT_LABELS,
  FINDING_TYPES,
  FINDING_TYPE_LABELS,
  DIMENSIONS,
  type FindingAspect,
  type FindingType,
  type Dimension,
} from '@/lib/types';
import { DIMENSION_LABELS } from '@/lib/dimension';

export default function FindingForm({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [findingNo, setFindingNo] = useState('');
  const [aspect, setAspect] = useState<FindingAspect>('MANAGEMENT');
  const [type, setType] = useState<FindingType>('NEEDS_IMPROVEMENT');
  const [dimension, setDimension] = useState<Dimension>('OUTSOURCING');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!findingNo || !title || !description) {
      setErr('請完整填寫');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/cycles/${cycleId}/findings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ findingNo, aspect, type, dimension, title, description }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '建立失敗' }));
      setErr(j.error ?? '建立失敗');
      return;
    }
    setFindingNo(''); setTitle(''); setDescription('');
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-md"
      >
        + 開立稽核發現
      </button>
    );
  }

  return (
    <div className="bg-white border rounded-xl p-5">
      <h3 className="font-semibold mb-3">開立稽核發現</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">編號 (如 5.1)</label>
          <input
            value={findingNo}
            onChange={(e) => setFindingNo(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
            placeholder="5.1"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">構面</label>
          <select
            value={aspect}
            onChange={(e) => setAspect(e.target.value as FindingAspect)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            {FINDING_ASPECTS.map((a) => (
              <option key={a} value={a}>{FINDING_ASPECT_LABELS[a]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">類型</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FindingType)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            {FINDING_TYPES.map((t) => (
              <option key={t} value={t}>{FINDING_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">檢核構面</label>
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value as Dimension)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            {DIMENSIONS.map((d) => (
              <option key={d} value={d}>{DIMENSION_LABELS[d].split('、')[0]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-xs text-slate-500 mb-1">標題</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
      </div>
      <div className="mt-3">
        <label className="block text-xs text-slate-500 mb-1">描述（建議包含依據、現況查證、應改善事項）</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
      </div>

      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={submit}
          disabled={saving}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-md disabled:opacity-60"
        >
          {saving ? '建立中…' : '建立'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-4 py-2 text-slate-600 text-sm"
        >
          取消
        </button>
      </div>
    </div>
  );
}
