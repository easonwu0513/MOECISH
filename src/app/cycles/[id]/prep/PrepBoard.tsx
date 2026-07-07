'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IndexBadge } from '@/components/ui/IndexBadge';
import { Chip } from '@/components/ui/Chip';
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { Plus, Check, AlertCircle, FileText, X } from '@/components/icons';
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { ProtectedFileLink } from '@/components/cycle/ProtectedFileLink';
import { PREP_STATUS_LABELS, PREP_CATEGORY_LABELS, prepOrgEditable, prepCyclePhaseOpen, prepOrgCanEdit, ORG_UPLOAD_ACCEPT, type PrepStatus, type PrepCategory } from '@/lib/types';
import { fmtROCDateTime, fmtROC } from '@/lib/date';

type Sub = {
  id: string;
  status: string;
  note: string | null;
  noFileReason: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
};
type Item = {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  category: string;
  submission: Sub | null;
};
type FileRec = { id: string; targetId: string; originalName: string; sizeBytes: number };

function statusTone(s: PrepStatus): 'neutral' | 'primary' | 'success' | 'danger' | 'warning' {
  switch (s) {
    case 'EMPTY': return 'neutral';
    case 'UPLOADED': return 'warning';
    case 'SUBMITTED': return 'primary';
    case 'CONFIRMED': return 'success';
    case 'INSUFFICIENT': return 'danger';
  }
}

const GROUP_ORDER: PrepCategory[] = ['TECH', 'ONSITE', 'CENTER'];

export default function PrepBoard({
  cycleId,
  role,
  cycleStatus,
  prepDueOnsiteISO,
  prepDueTechISO,
  initialItems,
  initialFiles,
}: {
  cycleId: string;
  role: string;
  cycleStatus: string;
  prepDueOnsiteISO: string | null;
  prepDueTechISO: string | null;
  initialItems: Item[];
  initialFiles: FileRec[];
}) {
  const router = useRouter();
  const toast = useToast();
  // 委員一律在週期進入「資料齊備」後才看得到中心匯入;準備中按「開放委員檢視」僅先標記,屆時才對委員生效
  const centerReleaseEffective = !prepCyclePhaseOpen(cycleStatus);
  const [busy, setBusy] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [reminding, setReminding] = useState<string | null>(null);
  const [remindingItem, setRemindingItem] = useState<string | null>(null);

  // 中心對受稽機關催繳該區應備資料(人工點擊;寄信給機關管理員)
  async function remind(cat: PrepCategory) {
    setReminding(cat);
    const res = await fetch(`/api/cycles/${cycleId}/prep/remind`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: cat }),
    }).catch(() => null);
    setReminding(null);
    if (res && res.ok) {
      const j = await res.json().catch(() => ({}));
      notifyRemindResult(j, '催繳');
    } else {
      const j = res ? await res.json().catch(() => ({})) : {};
      toast.error('催繳失敗', (j as { error?: string }).error ?? '連線逾時,請稍後再試');
    }
  }

  // 依實際寄送結果提示(sent=實寄/demo 記錄、skipped=24h 內已通知過去重、failed=寄送失敗),避免假成功
  function notifyRemindResult(j: { sent?: number; skipped?: number; failed?: number }, verb: string) {
    const sent = j.sent ?? 0;
    const skipped = j.skipped ?? 0;
    const failed = j.failed ?? 0;
    if (sent > 0) {
      toast.success(`已寄出${verb}通知`, `已通知 ${sent} 位機關管理員${skipped > 0 ? `(${skipped} 位 24 小時內已通知過,未重複寄送)` : ''}`);
    } else if (skipped > 0) {
      toast.info(`24 小時內已${verb}過`, '為避免重複轟炸機關,系統未再寄送;如需再次通知請隔日再試,或於「通知 Email」頁手動寄送。');
    } else if (failed > 0) {
      toast.error(`${verb}通知寄送失敗`, '請稍後再試,或於「通知 Email」頁確認寄信狀態。');
    } else {
      toast.success(`已送出${verb}`);
    }
  }

  // 中心逐項催補:針對單一尚未繳交的機關區需求項寄提醒
  async function remindItem(reqId: string) {
    setRemindingItem(reqId);
    const res = await fetch(`/api/cycles/${cycleId}/prep/remind`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requirementId: reqId }),
    }).catch(() => null);
    setRemindingItem(null);
    if (res && res.ok) {
      const j = await res.json().catch(() => ({}));
      notifyRemindResult(j, '催補');
    } else {
      const j = res ? await res.json().catch(() => ({})) : {};
      toast.error('催補失敗', (j as { error?: string }).error ?? '連線逾時,請稍後再試');
    }
  }

  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [addCat, setAddCat] = useState<PrepCategory>('ONSITE');

  const [returnOpen, setReturnOpen] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState('');
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [submitPending, setSubmitPending] = useState<PrepCategory | null>(null);
  const [pendingFile, setPendingFile] = useState<{ id: string; name: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ id: string; title: string } | null>(null);

  const isAdmin = role === 'SUPER_ADMIN';
  const isOrg = role === 'ORG_ADMIN';
  // 機關上傳/填說明僅限「資料準備中」;開立中(DRAFT)尚不可,避免階段混亂
  const orgCanEdit = isOrg && prepOrgCanEdit(cycleStatus);
  // 開立中(DRAFT):資料準備尚未對機關開放(中心仍在設定需求/匯入);機關區項目的狀態徽章與提示
  // 需明示「尚未開放此階段」而非「尚未處理」——機關與中心兩端皆然(中心此時也尚不能審核機關繳交)。
  const phaseNotOpen = cycleStatus === 'DRAFT';
  const adminCanReview = isAdmin && cycleStatus === 'PREPARATION';
  const adminCanImport = isAdmin && cycleStatus !== 'CLOSED'; // 中心匯入區可上傳

  const filesOf = (subId?: string) => (subId ? initialFiles.filter((f) => f.targetId === subId) : []);

  const catOf = (it: Item) => (it.category || 'ONSITE') as PrepCategory;
  const addressedOf = (it: Item) => {
    const sub = it.submission;
    if (!sub) return false;
    if (sub.status === 'SUBMITTED' || sub.status === 'CONFIRMED') return true;
    return filesOf(sub.id).length > 0 || !!sub.noFileReason?.trim();
  };
  // 確定繳交僅涵蓋機關區(技術檢測 / 實地稽核);中心匯入區由中心上傳
  const mechItems = initialItems.filter((it) => catOf(it) !== 'CENTER');

  const dueOf = (cat: PrepCategory): string | null =>
    cat === 'TECH' ? prepDueTechISO : cat === 'ONSITE' ? prepDueOnsiteISO : null;

  // 分類繳交:技術檢測 / 實地稽核 截止日不同,可各自獨立繳交(取代原本整批 canSubmit/draftCount)
  const orgCats: PrepCategory[] = ['TECH', 'ONSITE'];
  const catState = (cat: PrepCategory) => {
    const items = mechItems.filter((it) => catOf(it) === cat);
    const requiredUnaddressed = items.filter((it) => it.required && !addressedOf(it));
    const draftCount = items.filter((it) => {
      const s = it.submission?.status;
      return s !== 'SUBMITTED' && s !== 'CONFIRMED' && addressedOf(it);
    }).length;
    const canSubmit = isOrg && cycleStatus === 'PREPARATION' && draftCount > 0 && requiredUnaddressed.length === 0;
    return { items, requiredUnaddressed, draftCount, canSubmit };
  };

  async function applyStandard() {
    setBusy(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/prep?standard=1`, { method: 'POST' });
      if (res.ok) {
        const j = await res.json();
        toast.success('已套用標準清單', `新增 ${j.created} 項`);
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '失敗' }));
        toast.error('套用失敗', j.error);
      }
    } catch {
      toast.error('套用失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function addItem() {
    if (title.trim().length < 2) { toast.error('請輸入需求名稱'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/prep`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: desc.trim() || undefined, category: addCat }),
      });
      if (res.ok) {
        toast.success('已新增需求項');
        // 保留上次選的分區(常連續新增同區項目),只清標題/說明
        setTitle(''); setDesc(''); setAddOpen(false);
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '失敗' }));
        toast.error('新增失敗', j.error);
      }
    } catch {
      toast.error('新增失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(reqId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/prep-requirements/${reqId}`, { method: 'DELETE' });
      if (res.ok) { toast.success('已刪除需求項'); router.refresh(); }
      else {
        const j = await res.json().catch(() => ({ error: '失敗' }));
        toast.error('刪除失敗', j.error);
      }
    } catch {
      toast.error('刪除失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function upload(sub: Sub, e: React.ChangeEvent<HTMLInputElement>, center = false) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const tooBig = files.filter((f) => f.size > 20 * 1024 * 1024);
    if (tooBig.length > 0) {
      toast.error('檔案超過 20MB 上限', tooBig.map((f) => f.name).join('、'));
      e.target.value = '';
      return;
    }
    setBusyItemId(sub.id);
    try {
      let ok = 0;
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('targetType', 'PREP_SUBMISSION');
        fd.append('targetId', sub.id);
        const res = await fetch('/api/evidences', { method: 'POST', body: fd });
        if (res.ok) ok += 1;
        else {
          const j = await res.json().catch(() => ({ error: '上傳失敗' }));
          toast.error(`「${f.name}」上傳失敗`, j.error);
        }
      }
      if (ok > 0) {
        // 機關上傳需重算狀態(EMPTY→待繳交);中心匯入區(center)不走機關狀態機,免重算
        if (!center) {
          const r2 = await fetch(`/api/prep-submissions/${sub.id}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (!r2.ok) {
            toast.error('檔案已上傳,但狀態更新失敗', '請重新整理頁面;若狀態仍未變,請再上傳一次或聯繫中心');
          } else {
            toast.success('已上傳', files.length > 1 ? `共 ${ok}/${files.length} 個檔案` : files[0].name);
          }
        } else {
          toast.success('已匯入', files.length > 1 ? `共 ${ok}/${files.length} 個檔案` : files[0].name);
        }
        router.refresh();
      }
    } catch {
      toast.error('上傳失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusyItemId(null);
      e.target.value = '';
    }
  }

  async function saveReason(subId: string, text: string) {
    setBusyItemId(subId);
    try {
      const res = await fetch(`/api/prep-submissions/${subId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ noFileReason: text }),
      });
      if (res.ok) {
        toast.success(text.trim() ? '已儲存無檔說明' : '已清除說明');
        setReasonFor(null); setReasonText('');
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '儲存失敗' }));
        toast.error('儲存失敗', j.error);
      }
    } catch {
      toast.error('儲存失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusyItemId(null);
    }
  }

  async function submitCat(cat: PrepCategory) {
    setBusy(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/prep/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ category: cat }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('已確定繳交', `${PREP_CATEGORY_LABELS[cat]} ${j.submitted} 項已送交中心審核`);
        setSubmitPending(null);
        router.refresh();
      } else {
        toast.error('繳交失敗', j.error);
      }
    } catch {
      toast.error('繳交失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function doRemoveFile(id: string, name: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/evidences/${id}`, { method: 'DELETE' });
      setPendingFile(null);
      if (res.ok) {
        toast.success('已刪除檔案', name);
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '刪除失敗' }));
        toast.error('刪除失敗', j.error);
      }
    } catch {
      toast.error('刪除失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function review(subId: string, status: 'CONFIRMED' | 'INSUFFICIENT', note?: string) {
    setBusyItemId(subId);
    try {
      const res = await fetch(`/api/prep-submissions/${subId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, reviewNote: note }),
      });
      if (res.ok) {
        toast.success(status === 'CONFIRMED' ? '已確認齊備' : '已退回補正');
        setReturnOpen(null); setReturnNote('');
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '失敗' }));
        toast.error('操作失敗', j.error);
      }
    } catch {
      toast.error('操作失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusyItemId(null);
    }
  }

  // 中心匯入區:中心「開放委員檢視 / 收回」(釋出前委員看不到/載不到)
  async function releaseCenter(subId: string, release: boolean) {
    setBusyItemId(subId);
    try {
      const res = await fetch(`/api/prep-submissions/${subId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: release ? 'CONFIRMED' : 'EMPTY' }),
      });
      if (res.ok) {
        toast.success(release ? (centerReleaseEffective ? '已開放委員檢視' : '已標記開放(資料齊備階段後對委員生效)') : '已收回(暫不開放委員)');
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({ error: '失敗' }));
        toast.error('操作失敗', j.error);
      }
    } catch {
      toast.error('操作失敗', '連線逾時或網路中斷,請稍後再試');
    } finally {
      setBusyItemId(null);
    }
  }

  function renderItem(item: Item, idx: number) {
    const sub = item.submission;
    const files = filesOf(sub?.id);
    const isCenter = catOf(item) === 'CENTER';
    const rawStatus = (sub?.status ?? 'EMPTY') as PrepStatus;
    const addressedByContent = files.length > 0 || !!sub?.noFileReason?.trim();
    const status = rawStatus === 'EMPTY' && addressedByContent ? 'UPLOADED' : rawStatus;
    const orgItemEditable = orgCanEdit && !isCenter && prepOrgEditable(status);
    const confirmedLook = !isCenter && status === 'CONFIRMED';

    return (
      // 單項錨點:退回收件匣「應備文件退補」直達此卡(#prep-item-{id};大改造A 顆粒補齊)
      <div key={item.id} id={`prep-item-${item.id}`} className="scroll-mt-24">
      <Card padded={false} variant={confirmedLook ? 'filled' : 'elevated'}>
        <div className="p-5">
          <div className="flex items-start gap-4">
            <IndexBadge n={idx + 1} state={confirmedLook ? 'done' : 'default'} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-title text-ink-900">{item.title}</p>
                {!item.required && !isCenter && <Chip tone="neutral" size="sm">選附</Chip>}
                {isCenter ? (
                  <Chip
                    tone={status === 'CONFIRMED' ? 'success' : files.length > 0 ? 'warning' : 'neutral'}
                    size="sm"
                    dot
                  >
                    {status === 'CONFIRMED' ? (centerReleaseEffective ? '已開放委員檢視' : '已開放,資料齊備後生效') : files.length > 0 ? '已匯入待開放' : '中心待匯入'}
                  </Chip>
                ) : (
                  <Chip tone={phaseNotOpen && status === 'EMPTY' ? 'neutral' : statusTone(status)} size="sm" dot>
                    {phaseNotOpen && status === 'EMPTY' ? '尚未開放此階段' : PREP_STATUS_LABELS[status]}
                  </Chip>
                )}
              </div>
              {item.description && (
                <p className="mt-1.5 text-body-sm text-ink-500 leading-relaxed">{item.description}</p>
              )}

              {!isCenter && status === 'INSUFFICIENT' && sub?.reviewNote && (
                <div className="mt-2 rounded-md border border-danger-200 bg-danger-50 px-3.5 py-2.5">
                  <p className="flex items-center gap-1.5 text-body-sm font-medium text-danger-700">
                    <AlertCircle size={15} className="shrink-0" />
                    中心退回意見(補正重點)
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-body-sm text-ink-900 leading-relaxed">{sub.reviewNote}</p>
                  <p className="mt-1 text-caption text-danger-700">請依上述意見補正後重新繳交。</p>
                </div>
              )}
              {!isCenter && status === 'SUBMITTED' && (
                <p className="mt-2 text-caption text-ink-500">
                  已繳交{sub?.submittedAt ? `(${fmtROCDateTime(sub.submittedAt)})` : ''},等待中心審核;如需修改請洽中心退回。
                </p>
              )}

              {/* 其他說明(僅機關區;不限「無相關文件」,任何補充說明皆可填) */}
              {!isCenter && sub && reasonFor === sub.id ? (
                <div className="mt-3 flex flex-col gap-2">
                  <Textarea
                    label="其他說明"
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    rows={2}
                    placeholder="例:無相關文件說明(本機關無委外服務,故無委外管理相關文件…)"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" loading={busyItemId === sub.id} onClick={() => saveReason(sub.id, reasonText)}>儲存說明</Button>
                    <Button size="sm" variant="text" onClick={() => { setReasonFor(null); setReasonText(''); }}>取消</Button>
                  </div>
                </div>
              ) : !isCenter && sub?.noFileReason ? (
                <div className="mt-2 flex items-start gap-2 rounded-sm bg-paper-sunk text-ink-500 px-3 py-2 text-body-sm">
                  <FileText size={16} className="mt-0.5 shrink-0" />
                  <span className="flex-1">其他說明:{sub.noFileReason}</span>
                  {orgItemEditable && (
                    <button
                      type="button"
                      onClick={() => { setReasonFor(sub.id); setReasonText(sub.noFileReason ?? ''); }}
                      className="text-caption text-primary-700 hover:underline shrink-0 focus-ring rounded-sm px-1"
                    >修改</button>
                  )}
                </div>
              ) : null}

              {/* 檔案列表 */}
              {files.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-2">
                      <ProtectedFileLink
                        fileId={f.id}
                        name={f.originalName}
                        sizeKB={Math.round(f.sizeBytes / 1024)}
                        viewOnly={role === 'AUDITOR'}
                      />
                      {((orgItemEditable) || (isCenter && adminCanImport)) && (
                        <button
                          type="button"
                          onClick={() => setPendingFile({ id: f.id, name: f.originalName })}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-500 hover:text-danger-600 hover:bg-danger-50 transition-colors focus-ring"
                          aria-label={`刪除檔案 ${f.originalName}`}
                          title="刪除這個檔案"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* 動作列 */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {/* 機關區:可編輯狀態才有上傳 / 敘述理由 */}
                {orgItemEditable && sub && (
                  <>
                    <FileUploadButton
                      size="sm"
                      label="上傳檔案(可多選)"
                      busy={busyItemId === sub.id}
                      onChange={(e) => upload(sub, e)}
                      multiple
                      accept={ORG_UPLOAD_ACCEPT}
                    />
                    {!sub.noFileReason && reasonFor !== sub.id && (
                      <Button size="sm" variant="text" onClick={() => { setReasonFor(sub.id); setReasonText(''); }}>
                        其他說明
                      </Button>
                    )}
                    <span className="text-caption text-ink-500">僅接受 PDF / JPG / PNG(上傳後自動加機關浮水印);Word、Excel 等其他格式請先轉換為 PDF/JPG/PNG 再上傳。單檔 ≤ 20MB</span>
                  </>
                )}

                {/* 中心匯入區:中心上傳 */}
                {isCenter && adminCanImport && sub && (
                  <>
                    <FileUploadButton
                      size="sm"
                      label="中心上傳資料"
                      busy={busyItemId === sub.id}
                      onChange={(e) => upload(sub, e, true)}
                      multiple
                      accept={ORG_UPLOAD_ACCEPT}
                    />
                    <span className="text-caption text-ink-500">僅接受 PDF / JPG / PNG(上傳後自動加浮水印供委員審閱);Word、Excel 等其他格式請先轉換為 PDF/JPG/PNG 再上傳。單檔 ≤ 20MB</span>
                  </>
                )}
                {/* 中心匯入區:開放委員檢視 / 收回(釋出前委員看不到、載不到) */}
                {isCenter && isAdmin && adminCanImport && sub && files.length > 0 && (
                  status === 'CONFIRMED' ? (
                    <Button size="sm" variant="text" onClick={() => releaseCenter(sub.id, false)} loading={busyItemId === sub.id}>
                      收回(暫不開放委員)
                    </Button>
                  ) : (
                    <Button size="sm" variant="tonal" leadingIcon={<Check size={14} />} onClick={() => releaseCenter(sub.id, true)} loading={busyItemId === sub.id}>
                      開放委員檢視
                    </Button>
                  )
                )}
                {isCenter && !adminCanImport && files.length === 0 && (
                  <span className="text-caption text-ink-500">
                    {isAdmin ? '週期已結案,無法再匯入' : '由中心匯入,尚未上傳'}
                  </span>
                )}

                {/* 中心審核(僅機關區、僅資料準備階段) */}
                {!isCenter && adminCanReview && sub && status === 'SUBMITTED' && (
                  <>
                    <Button size="sm" variant="tonal" leadingIcon={<Check size={14} />} onClick={() => review(sub.id, 'CONFIRMED')} loading={busyItemId === sub.id}>
                      確認齊備
                    </Button>
                    <Button size="sm" variant="text" onClick={() => { setReturnOpen(sub.id); setReturnNote(''); }}>退回補正</Button>
                  </>
                )}
                {!isCenter && adminCanReview && sub && status === 'CONFIRMED' && (
                  <Button size="sm" variant="text" onClick={() => { setReturnOpen(sub.id); setReturnNote(''); }}>退回重審</Button>
                )}
                {!isCenter && adminCanReview && sub && (status === 'EMPTY' || status === 'UPLOADED' || status === 'INSUFFICIENT') && (
                  <span className="text-caption text-ink-500">
                    {status === 'INSUFFICIENT' ? '已退回,待機關補正後重新繳交' : status === 'UPLOADED' ? '機關編輯中,尚未確定繳交' : '機關尚未上傳或敘明'}
                  </span>
                )}

                {/* 中心逐項催補:機關區、尚未繳交/確認的項目(資料準備中);寄提醒給機關管理員 */}
                {!isCenter && isAdmin && cycleStatus === 'PREPARATION' && status !== 'CONFIRMED' && status !== 'SUBMITTED' && (
                  <Button size="sm" variant="tonal" loading={remindingItem === item.id} onClick={() => remindItem(item.id)}>
                    催補此項
                  </Button>
                )}

                {/* 中心可刪除尚無上傳檔/無理由的需求項(逐年清單可增刪;已上傳則不可刪) */}
                {isAdmin && files.length === 0 && !sub?.noFileReason && (
                  <Button size="sm" variant="text" onClick={() => setDeletingItem({ id: item.id, title: item.title })} disabled={busy}>刪除</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {phaseNotOpen && isOrg && (
        <div className="flex items-start gap-2 rounded-md bg-paper-sunk px-4 py-3 text-body-sm text-ink-500 leading-relaxed">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-primary-600" />
          <span>此階段(開立中)尚未開放資料準備。待中心將週期推進至「資料準備中」後,即可上傳文件或敘明無相關文件並「確定繳交」。目前各項僅供檢視。</span>
        </div>
      )}
      {phaseNotOpen && isAdmin && (
        <div className="flex items-start gap-2 rounded-md bg-paper-sunk px-4 py-3 text-body-sm text-ink-500 leading-relaxed">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-primary-600" />
          <span>此階段(開立中)資料準備尚未對機關開放。您可先設定需求清單、匯入中心資料;待推進至「資料準備中」後,機關才能上傳並繳交、您才能逐項審核確認齊備。</span>
        </div>
      )}

      {isAdmin && (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => setAddOpen(true)} leadingIcon={<Plus size={15} />}>新增需求項</Button>
          <Button size="sm" variant="tonal" onClick={applyStandard} loading={busy}>套用標準清單</Button>
        </div>
      )}

      {/* 機關:分別確定繳交(技術檢測 / 實地稽核 截止日不同,可各自獨立繳交) */}
      {isOrg && cycleStatus === 'PREPARATION' && mechItems.length > 0 && (
        <Card padded={false} variant="filled">
          <div className="p-4 flex flex-col divide-y divide-rule">
            {orgCats
              .filter((cat) => mechItems.some((it) => catOf(it) === cat))
              .map((cat) => {
                const st = catState(cat);
                const due = dueOf(cat);
                return (
                  <div key={cat} className="flex items-center justify-between gap-4 flex-wrap py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-title text-ink-900">
                        {PREP_CATEGORY_LABELS[cat]}・確定繳交
                        {due && <span className="ml-2 text-caption text-ink-500">截止 {fmtROC(due)}</span>}
                      </p>
                      <p className="mt-0.5 text-body-sm text-ink-500 leading-relaxed">
                        {st.requiredUnaddressed.length > 0
                          ? `尚有 ${st.requiredUnaddressed.length} 項必填未處理(請上傳檔案或敘明無相關文件理由)`
                          : st.draftCount > 0
                            ? `${st.draftCount} 項已處理、待確定繳交;確定繳交後文件鎖定送交中心審核,需中心退回才能再修改。`
                            : '本區已全部繳交,等待中心審核。'}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setSubmitPending(cat)} disabled={!st.canSubmit || busy || busyItemId !== null} leadingIcon={<Check size={15} />}>
                      確定繳交{st.draftCount > 0 ? `(${st.draftCount})` : ''}
                    </Button>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {initialItems.length === 0 ? (
        <Card variant="outlined" padded={false}>
          <div className="p-6">
            <EmptyState
              icon={<FileText size={28} />}
              title="尚未設定資料準備需求"
              description={isAdmin ? '點「套用標準清單」快速建立,或逐項新增(可選技術檢測 / 實地稽核 / 中心匯入)。' : '等最高管理員設定需求清單後,這裡會顯示待上傳項目。'}
            />
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {GROUP_ORDER.map((cat) => {
            const groupItems = initialItems.filter((it) => catOf(it) === cat);
            if (groupItems.length === 0) return null;
            const due = dueOf(cat);
            return (
              // id 錨點供側欄階層樹「資料準備分類」直達(#prep-tech/#prep-onsite/#prep-center)
              <section key={cat} id={`prep-${cat.toLowerCase()}`} className="scroll-mt-24">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <h2 className="text-title-md text-ink-900">{PREP_CATEGORY_LABELS[cat]}</h2>
                  <Chip tone="neutral" size="sm">{groupItems.length}</Chip>
                  {cat === 'CENTER' ? (
                    <span className="text-caption text-ink-500">由中心上傳匯入,供委員審閱(無機關繳交)</span>
                  ) : due ? (
                    <span className="text-caption text-ink-500">繳交截止 {fmtROC(due)}</span>
                  ) : null}
                  {/* 中心催繳:寄信提醒機關管理員儘速繳交該區資料 */}
                  {isAdmin && cat !== 'CENTER' && (
                    <Button
                      size="sm"
                      variant="text"
                      loading={reminding === cat}
                      onClick={() => remind(cat)}
                    >
                      催繳
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  {groupItems.map((item, i) => renderItem(item, i))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* 新增需求 dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(v) => !busy && setAddOpen(v)}
        title="新增資料需求項"
        description="設定機關需上傳之技術檢測 / 實地稽核文件,或由中心匯入之資料。"
        footer={
          <>
            <Button variant="text" onClick={() => setAddOpen(false)} disabled={busy}>取消</Button>
            <Button onClick={addItem} loading={busy}>新增</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <p className="text-caption font-medium text-ink-500 mb-1.5">分區</p>
            <Segmented
              value={addCat}
              onChange={(v) => setAddCat(v as PrepCategory)}
              options={[
                { value: 'TECH', label: '技術檢測' },
                { value: 'ONSITE', label: '實地稽核' },
                { value: 'CENTER', label: '中心匯入' },
              ]}
            />
          </div>
          <TextField label="需求名稱" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例:資通安全維護計畫" />
          <Textarea label="說明(選填)" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="例:最新核定版本" />
        </div>
      </Dialog>

      {/* 中心退回 dialog */}
      <ConfirmDialog
        open={returnOpen !== null}
        onOpenChange={(o) => !busy && !o && setReturnOpen(null)}
        title="退回補正"
        description={
          <div className="mt-2">
            <Textarea
              label="退回說明(必填)"
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              rows={3}
              placeholder="例:缺 ISMS 證書附件,請補上傳含 TAF 標誌之版本…"
            />
          </div>
        }
        confirmLabel="退回補正"
        tone="danger"
        onConfirm={() => {
          if (!returnNote.trim()) { toast.error('請填寫退回說明'); return; }
          if (returnOpen) review(returnOpen, 'INSUFFICIENT', returnNote.trim());
        }}
        loading={busyItemId !== null}
      />

      {/* 確定繳交確認(分類) */}
      <ConfirmDialog
        open={submitPending !== null}
        onOpenChange={(o) => !busy && !o && setSubmitPending(null)}
        title="確定繳交稽核前資料"
        description={
          submitPending
            ? `將把「${PREP_CATEGORY_LABELS[submitPending]}」區 ${catState(submitPending).draftCount} 項資料送交中心審核。繳交後該些項目的檔案會鎖定,無法再撤回或刪改,需中心退回才能修改。確定繳交?`
            : ''
        }
        confirmLabel="確定繳交"
        onConfirm={() => { if (submitPending) return submitCat(submitPending); }}
        loading={busy}
      />

      {/* 刪除檔案確認 */}
      <ConfirmDialog
        open={pendingFile !== null}
        onOpenChange={(o) => !busy && !o && setPendingFile(null)}
        title="刪除檔案"
        description={pendingFile ? `確定刪除「${pendingFile.name}」?刪除後無法復原。` : undefined}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={() => { if (pendingFile) doRemoveFile(pendingFile.id, pendingFile.name); }}
        loading={busy}
      />

      {/* 刪除需求項確認 */}
      <ConfirmDialog
        open={deletingItem !== null}
        onOpenChange={(o) => !busy && !o && setDeletingItem(null)}
        title="刪除需求項"
        description={deletingItem ? `確定刪除需求項「${deletingItem.title}」?此操作無法復原。` : undefined}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={() => { if (deletingItem) { removeItem(deletingItem.id); setDeletingItem(null); } }}
        loading={busy}
      />
    </div>
  );
}
