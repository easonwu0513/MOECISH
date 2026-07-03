'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { Eye } from '@/components/icons';

/**
 * 委員審閱時間區間設定(UAT 批67;中心 SUPER_ADMIN):設定委員可檢視「資料準備 + 檢核表審閱」的開放時段。
 * 使用者裁定「沒設區間就不開放」→ 未設(或清除)時委員一律無法檢視,故未設時以警示樣式明確提示中心。
 * 日粒度:start 取當日 00:00、end 取當日 23:59:59(含當日),後端 PATCH /api/cycles/[id] 換算。
 */
export function ReviewWindowSetting({
  cycleId,
  initialStart,
  initialEnd,
}: {
  cycleId: string;
  /** yyyy-mm-dd(已依 +08:00 解析);null=未設 */
  initialStart: string | null;
  initialEnd: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [start, setStart] = useState(initialStart ?? '');
  const [end, setEnd] = useState(initialEnd ?? '');
  const [busy, setBusy] = useState(false);
  const isSet = !!(initialStart && initialEnd);

  async function save() {
    if (start && end && end < start) {
      toast.error('日期順序不正確', '審閱截止不可早於開始日期');
      return;
    }
    // 一端有一端空:提醒需兩端皆填才會開放(沒設區間就不開放)
    if ((start && !end) || (!start && end)) {
      toast.error('請設定完整區間', '開始與截止都要填,委員才會在此時段內開放檢視。');
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewWindowStart: start || null, reviewWindowEnd: end || null }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      toast.error('儲存失敗', (j as { error?: string }).error ?? '連線逾時,請稍後再試');
      return;
    }
    toast.success(
      '已儲存委員審閱時間區間',
      start && end ? '委員將於此時段內可檢視資料準備與檢核表審閱。' : '已清除;委員目前無法檢視(未設區間即不開放)。',
    );
    router.refresh();
  }

  return (
    <div className={`mb-5 rounded-lg border px-4 py-3.5 ${isSet ? 'border-primary-100 bg-primary-50/50' : 'border-warning-200 bg-warning-50'}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 shrink-0 ${isSet ? 'text-primary-700' : 'text-warning-700'}`}><Eye size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-medium text-on-surface">委員審閱時間區間</p>
          <p className="mt-0.5 text-caption text-on-surface-variant leading-relaxed">
            設定委員可檢視「資料準備」與「資通安全檢核表審閱」的開放時段;
            {isSet ? '未到不可看、超過不可看。' : <span className="text-warning-700 font-medium">目前未設定,委員無法檢視機關資料——請設定開始與截止日期。</span>}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <TextField label="開放開始" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <TextField label="開放截止" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            <Button size="sm" onClick={save} loading={busy}>儲存區間</Button>
            {(start || end) && (
              <Button size="sm" variant="text" disabled={busy} onClick={() => { setStart(''); setEnd(''); }}>清除</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
