'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Plus } from '@/components/icons';
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
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [findingNo, setFindingNo] = useState('');
  const [aspect, setAspect] = useState<FindingAspect>('MANAGEMENT');
  const [type, setType] = useState<FindingType>('NEEDS_IMPROVEMENT');
  const [dimension, setDimension] = useState<Dimension>('OUTSOURCING');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setFindingNo(''); setTitle(''); setDescription('');
    setAspect('MANAGEMENT'); setType('NEEDS_IMPROVEMENT'); setDimension('OUTSOURCING');
  }

  async function submit() {
    if (!findingNo || !title || !description) {
      toast.error('請完整填寫', '編號、標題與描述皆為必填');
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
      toast.error('建立失敗', j.error);
      return;
    }
    toast.success('已開立稽核發現', `${findingNo} · ${title}`);
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} leadingIcon={<Plus size={16} />}>
        開立稽核發現
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => { if (!saving) setOpen(v); }}
        title="開立稽核發現"
        description="記錄本次實地稽核的發現與建議；待改善事項會自動建立改善單供受稽機關填報。"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>取消</Button>
            <Button variant="primary" onClick={submit} loading={saving}>建立</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="編號"
            placeholder="例 5.1"
            value={findingNo}
            onChange={(e) => setFindingNo(e.target.value)}
          />
          <Select
            label="構面"
            value={aspect}
            onChange={(e) => setAspect(e.target.value as FindingAspect)}
          >
            {FINDING_ASPECTS.map((a) => (
              <option key={a} value={a}>{FINDING_ASPECT_LABELS[a]}</option>
            ))}
          </Select>
          <Select
            label="類型"
            value={type}
            onChange={(e) => setType(e.target.value as FindingType)}
          >
            {FINDING_TYPES.map((t) => (
              <option key={t} value={t}>{FINDING_TYPE_LABELS[t]}</option>
            ))}
          </Select>
          <Select
            label="檢核構面"
            value={dimension}
            onChange={(e) => setDimension(e.target.value as Dimension)}
          >
            {DIMENSIONS.map((d) => (
              <option key={d} value={d}>{DIMENSION_LABELS[d].split('、')[0]}</option>
            ))}
          </Select>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <TextField
            label="標題"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例 委外業務未做風險評估"
          />
          <Textarea
            label="描述"
            helperText="建議包含依據、現況查證、應改善事項"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </Dialog>
    </>
  );
}
