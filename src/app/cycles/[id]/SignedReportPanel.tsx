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
  const [pendingSubmit, setPendingSubmit] = useState<string | null>(null);
  const [pendingReturn, setPendingReturn] = useState<string | null>(null);

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
    if (f.size > 20 * 1024 * 1024) {
      toast.error('檔案超過 20MB 上限', '掃描時建議解析度 200dpi、黑白或灰階,可大幅縮小檔案');
      e.target.value = '';
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch(`/api/cycles/${cycleId}/signed-reports`, { method: 'POST', body: fd });
    setBusy(false);
    if (res.ok) {
      toast.success('已上傳用印掃描檔', '確認檔案無誤後,請按「確認繳交」鎖定版本並通知中心。');
      await load();
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '上傳失敗' }));
      toast.error('上傳失敗', j.error);
    }
    e.target.value = '';
  }

  // 機關「確認繳交」→ 鎖定此掃描檔為正式版本 + 通知中心確認
  async function submit(reportId: string) {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/signed-reports?reportId=${reportId}&action=submit`, {
      method: 'PATCH',
    });
    setBusy(false);
    setPendingSubmit(null);
    if (res.ok) {
      toast.success('已確認繳交用印掃描檔', '已通知最高管理員確認。');
      await load();
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '繳交失敗' }));
      toast.error('繳交失敗', j.error);
    }
  }

  // 中心退回:解除鎖定,讓機關可重新上傳/繳交正確版本
  async function returnReport(reportId: string) {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/signed-reports?reportId=${reportId}&action=return`, {
      method: 'PATCH',
    });
    setBusy(false);
    setPendingReturn(null);
    if (res.ok) {
      toast.success('已退回用印掃描檔', '已解除鎖定,並站內通知機關重新上傳。');
      await load();
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '退回失敗' }));
      toast.error('退回失敗', j.error);
    }
  }

  // 最高管理員確認(結案前置);須機關已確認繳交
  async function confirm(reportId: string) {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/signed-reports?reportId=${reportId}&action=confirm`, {
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

  // 上傳僅限機關管理員(中心只檢視+確認);已繳交/確認或結案後鎖定不可再上傳
  const canUpload = role === 'ORG_ADMIN' && !locked;
  const canConfirm = role === 'SUPER_ADMIN';

  return (
    <Card className="mb-6">
      <CardTitle>用印掃描檔</CardTitle>
        <CardDescription>
          全數缺失審核通過後，請列印改善報告、機關用印，並將掃描檔（PDF / 圖片）上傳；
          上傳後請按「確認繳交」鎖定版本並通知中心，經最高管理員確認後方可結案。
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
                      {it.submittedAt
                        ? `繳交於 ${fmtROCDateTime(it.submittedAt)}`
                        : `上傳於 ${fmtROCDateTime(it.uploadedAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {it.confirmedAt ? (
                      <Chip tone="success" size="sm" dot>已確認</Chip>
                    ) : it.submittedAt ? (
                      canConfirm ? (
                        <Button size="sm" variant="tonal" onClick={() => confirm(it.id)} loading={busy} leadingIcon={<Check size={14} />}>
                          確認
                        </Button>
                      ) : (
                        <Chip tone="primary" size="sm" dot>已繳交・待中心確認</Chip>
                      )
                    ) : role === 'ORG_ADMIN' && !locked ? (
                      <Button size="sm" variant="filled" onClick={() => setPendingSubmit(it.id)} loading={busy} leadingIcon={<Check size={14} />}>
                        確認繳交
                      </Button>
                    ) : (
                      <Chip tone="neutral" size="sm">未繳交</Chip>
                    )}
                    {/* 中心退回(解除鎖定):機關已繳交或已確認、且週期未結案時可退回讓機關換版 */}
                    {canConfirm && it.submittedAt && !closed && (
                      <Button size="sm" variant="text" onClick={() => setPendingReturn(it.id)} loading={busy}>
                        退回
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
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
            <p className="text-caption text-on-surface-variant -mt-1">
              單檔 ≤ 20MB;限 PDF 或圖片(PNG/JPG)。上傳後請按「確認繳交」通知中心。
            </p>
          )}
          {role === 'ORG_ADMIN' && locked && (
            <p className="text-caption text-on-surface-variant -mt-1">
              掃描檔已確認繳交(或週期已結案),不可再上傳;如需更換請聯繫中心退回。
            </p>
          )}
        </div>

        {/* 機關確認繳交(不可逆鎖定):分條列後果 */}
        <ConfirmDialog
          open={pendingSubmit !== null}
          onOpenChange={(o) => !busy && !o && setPendingSubmit(null)}
          title="確認繳交用印掃描檔"
          description={
            <ul className="mt-1 list-disc pl-5 space-y-1.5 text-body-sm text-on-surface-variant">
              <li>此掃描檔將鎖定為<span className="font-medium text-on-surface">正式繳交版本</span>,不可再更換或重新上傳。</li>
              <li>系統將以 Email 與站內通知請最高管理員確認,確認後即可結案。</li>
              <li>如需更換版本,須聯繫中心「退回」解除鎖定後才能重新上傳。</li>
            </ul>
          }
          confirmLabel="確認繳交"
          onConfirm={() => { if (pendingSubmit) return submit(pendingSubmit); }}
          loading={busy}
        />

        {/* 中心退回(解除鎖定) */}
        <ConfirmDialog
          open={pendingReturn !== null}
          onOpenChange={(o) => !busy && !o && setPendingReturn(null)}
          title="退回用印掃描檔"
          description="退回後將解除此掃描檔的鎖定,機關可重新上傳並再次「確認繳交」;系統會以站內通知請機關重新處理。"
          confirmLabel="退回"
          tone="danger"
          onConfirm={() => { if (pendingReturn) return returnReport(pendingReturn); }}
          loading={busy}
        />
      </Card>
  );
}
