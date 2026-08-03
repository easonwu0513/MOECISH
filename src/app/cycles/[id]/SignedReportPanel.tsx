'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { FileText, Check } from '@/components/icons';
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { fmtROCDateTime } from '@/lib/date';

type Item = {
  id: string;
  fileName: string;
  uploadedAt: string;
  submittedAt: string | null;
  confirmedAt: string | null;
};

export default function SignedReportPanel({
  cycleId,
  role,
  locked = false,
  closed = false,
}: {
  cycleId: string;
  role: string;
  /** 已有繳交/確認之掃描檔或週期已結案 → 機關不可再上傳 */
  locked?: boolean;
  /** 週期已結案 → 中心不可再退回 */
  closed?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  // 不可逆動作改正式確認對話框(取代 window.confirm:易閃過、與全站慣例不一致)
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [pendingReturn, setPendingReturn] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState(false); // 尚有待繳交檔時,確認前先示警

  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  async function load() {
    const res = await fetch(`/api/cycles/${cycleId}/signed-reports`).catch(() => null);
    if (!res || !res.ok) { setLoadErr(true); setLoaded(true); return; }
    const j = await res.json();
    setItems(j.items ?? []);
    setLoadErr(false);
    setLoaded(true);
  }
  useEffect(() => { load(); }, [cycleId]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      toast.error('檔案超過 20MB 上限', '掃描時建議解析度 200dpi、黑白或灰階，可大幅縮小檔案');
      e.target.value = '';
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch(`/api/cycles/${cycleId}/signed-reports`, { method: 'POST', body: fd });
    setBusy(false);
    if (res.ok) {
      toast.success('已上傳用印掃描檔', '確認檔案無誤後，請按「確認繳交」鎖定版本並通知中心。');
      await load();
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '上傳失敗' }));
      toast.error('上傳失敗', j.error);
    }
    e.target.value = '';
  }

  // UAT 圖77:三個動作皆為「整組」——一份用印報告可分多個掃描檔,不再逐檔操作
  async function patch(action: 'submit' | 'return' | 'confirm', okTitle: string, okDesc: string, failTitle: string) {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/signed-reports?action=${action}`, { method: 'PATCH' });
    setBusy(false);
    setPendingSubmit(false);
    setPendingReturn(false);
    setPendingConfirm(false);
    if (res.ok) {
      toast.success(okTitle, okDesc);
      await load();
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: failTitle }));
      toast.error(failTitle, j.error);
    }
  }

  const submitAll = () =>
    patch('submit', '已確認繳交用印掃描檔', '整組掃描檔已鎖定，並通知最高管理員確認。', '繳交失敗');
  const returnAll = () =>
    patch('return', '已退回用印掃描檔', '已整組解除鎖定，並站內通知機關重新處理。', '退回失敗');
  const confirmAll = () => patch('confirm', '已確認用印掃描檔', '可進行結案。', '確認失敗');

  // 機關刪除誤傳的掃描檔(僅未繳交前;整組繳交語意下必須能剔除誤傳檔)
  async function remove(reportId: string) {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/signed-reports?reportId=${reportId}`, { method: 'DELETE' });
    setBusy(false);
    setPendingDelete(null);
    if (res.ok) {
      toast.success('已刪除掃描檔');
      await load();
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '刪除失敗' }));
      toast.error('刪除失敗', j.error);
    }
  }

  // 上傳僅限機關管理員(中心只檢視+確認);已繳交/確認或結案後鎖定不可再上傳
  const canUpload = role === 'ORG_ADMIN' && !locked;
  const canConfirm = role === 'SUPER_ADMIN';
  // 整組狀態:待繳交份數 / 已繳交未確認份數 / 是否已有鎖定或確認版本
  const pendingCount = items.filter((i) => !i.submittedAt && !i.confirmedAt).length;
  const submittedNotConfirmed = items.filter((i) => i.submittedAt && !i.confirmedAt).length;
  const anyConfirmed = items.some((i) => i.confirmedAt);
  const anyLocked = items.some((i) => i.submittedAt || i.confirmedAt);

  return (
    <Card className="mb-6">
      <CardTitle>用印掃描檔</CardTitle>
        <CardDescription>
          全數缺失審核通過後，請列印改善報告、機關用印，並將掃描檔（PDF / 圖片）上傳；
          報告分成多份掃描檔時可逐一上傳，按「確認繳交」會將<span className="font-medium">目前清單整組</span>
          鎖定為正式版本並通知中心，經最高管理員確認後方可結案。
        </CardDescription>

        <div className="mt-4 flex flex-col gap-3">
          {!loaded ? (
            <p className="text-body-sm text-ink-500">載入中…</p>
          ) : loadErr ? (
            <p className="text-body-sm text-danger-700">無法載入掃描檔清單，請重新整理頁面再試。</p>
          ) : items.length === 0 ? (
            <p className="text-body-sm text-ink-500">尚未上傳</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 rounded-md border border-rule px-4 py-3">
                  <FileText size={18} className="text-ink-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={`/api/signed-reports/${it.id}/download`}
                      className="text-body-sm text-primary-700 hover:underline truncate block"
                    >
                      {it.fileName}
                    </a>
                    <p className="text-caption text-ink-500">
                      {it.submittedAt
                        ? `繳交於 ${fmtROCDateTime(it.submittedAt)}`
                        : `上傳於 ${fmtROCDateTime(it.uploadedAt)}`}
                    </p>
                  </div>
                  {/* UAT 圖77:逐列只呈現狀態(繳交/退回/確認皆為整組動作,移至清單下方動作列);
                      未繳交者機關可刪除,避免誤傳的檔案被連帶繳交進正式版本 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {it.confirmedAt ? (
                      <Chip tone="success" size="sm" dot>已確認</Chip>
                    ) : it.submittedAt ? (
                      <Chip tone="primary" size="sm" dot>已繳交・待中心確認</Chip>
                    ) : (
                      <Chip tone="neutral" size="sm">待繳交</Chip>
                    )}
                    {role === 'ORG_ADMIN' && !it.submittedAt && !it.confirmedAt && !closed && (
                      <Button size="sm" variant="text" onClick={() => setPendingDelete(it)} loading={busy}>
                        刪除
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* UAT 圖77:整組動作列——確認繳交(機關)/確認・退回(中心) */}
          {loaded && !loadErr && items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {role === 'ORG_ADMIN' && pendingCount > 0 && !anyConfirmed && !closed && (
                <Button size="sm" variant="filled" onClick={() => setPendingSubmit(true)} loading={busy} leadingIcon={<Check size={14} />}>
                  確認繳交（{pendingCount} 份）
                </Button>
              )}
              {canConfirm && submittedNotConfirmed > 0 && (
                <Button
                  size="sm"
                  variant="tonal"
                  onClick={() => (pendingCount > 0 ? setPendingConfirm(true) : confirmAll())}
                  loading={busy}
                  leadingIcon={<Check size={14} />}
                >
                  確認（{submittedNotConfirmed} 份）
                </Button>
              )}
              {canConfirm && anyLocked && !closed && (
                <Button size="sm" variant="text" onClick={() => setPendingReturn(true)} loading={busy}>
                  退回
                </Button>
              )}
            </div>
          )}

          {canUpload && (
            <FileUploadButton
              className="w-fit"
              label="+ 上傳掃描檔"
              busyLabel="處理中…"
              busy={busy}
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={upload}
            />
          )}
          {canUpload && (
            <p className="text-caption text-ink-500 -mt-1">
              單檔 ≤ 20MB;限 PDF 或圖片（PNG/JPG）。可上傳多份（如報告分頁掃描），確認無誤後一次「確認繳交」。
            </p>
          )}
          {role === 'ORG_ADMIN' && locked && (
            <p className="text-caption text-ink-500 -mt-1">
              已有繳交版本，不可再上傳新檔；尚未繳交的檔案仍可刪除或補繳，如需更換已繳交版本請聯繫中心退回。
            </p>
          )}
        </div>

        {/* 機關確認繳交(整組、不可逆鎖定):分條列後果 */}
        <ConfirmDialog
          open={pendingSubmit}
          onOpenChange={(o) => !busy && !o && setPendingSubmit(false)}
          title={`確認繳交用印掃描檔（${pendingCount} 份）`}
          description={
            <ul className="mt-1 list-disc pl-5 space-y-1.5 text-body-sm text-ink-500">
              <li>目前已上傳的 {pendingCount} 份掃描檔將<span className="font-medium text-ink-900">整組鎖定為正式繳交版本</span>，不可再增刪或重新上傳。</li>
              <li>若清單中有誤傳的檔案，請先按該列「刪除」移除後再繳交。</li>
              <li>系統將以 Email 與站內通知請最高管理員確認，確認後即可結案。</li>
              <li>如需更換版本，須聯繫中心「退回」解除鎖定後才能重新上傳。</li>
            </ul>
          }
          confirmLabel="確認繳交"
          onConfirm={submitAll}
          loading={busy}
        />

        {/* 中心退回(整組解除鎖定) */}
        <ConfirmDialog
          open={pendingReturn}
          onOpenChange={(o) => !busy && !o && setPendingReturn(false)}
          title="退回用印掃描檔"
          description="退回後將整組解除鎖定，機關可增刪檔案後再次「確認繳交」；系統會以站內通知請機關重新處理。"
          confirmLabel="退回"
          tone="danger"
          onConfirm={returnAll}
          loading={busy}
        />

        {/* 機關刪除誤傳掃描檔(僅未繳交前) */}
        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={(o) => !busy && !o && setPendingDelete(null)}
          title="刪除此掃描檔？"
          description={pendingDelete ? `「${pendingDelete.fileName}」將自本週期移除，不會被納入繳交版本。此操作不可復原，如仍需要請重新上傳。` : undefined}
          confirmLabel="刪除"
          tone="danger"
          onConfirm={() => { if (pendingDelete) return remove(pendingDelete.id); }}
          loading={busy}
        />

        {/* 中心確認:尚有待繳交檔案時先示警(確認後機關即無法補繳,須退回整組才能重來) */}
        <ConfirmDialog
          open={pendingConfirm}
          onOpenChange={(o) => !busy && !o && setPendingConfirm(false)}
          title="仍有待繳交的掃描檔"
          description={`清單中尚有 ${pendingCount} 份掃描檔機關未確認繳交。確認後機關將無法再補繳（須由中心「退回」整組才能重新處理）。確定只確認已繳交的 ${submittedNotConfirmed} 份？`}
          confirmLabel="仍要確認"
          tone="warning"
          onConfirm={confirmAll}
          loading={busy}
        />
      </Card>
  );
}
