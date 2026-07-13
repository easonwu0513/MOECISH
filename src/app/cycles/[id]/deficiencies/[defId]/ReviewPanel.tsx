'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Shield, ShieldCheck, AlertTriangle } from '@/components/icons';
import { TOAST } from '@/lib/copy';

/** 退回理由常用片語(點擊附加到意見欄) */
const RETURN_PHRASES = [
  '佐證文件不足，請補附執行紀錄或畫面截圖',
  '根因分析未對應缺失內容，請重新檢視',
  '改善時程過長，請重新評估並說明理由',
];

/** 通過意見常用片語(高頻動作也提供快捷,免手打) */
const PASS_PHRASES = [
  '佐證齊備，符合要求',
  '已改善並留存紀錄',
];

export default function ReviewPanel({
  deficiencyId,
  round,
  nextHref,
  remaining,
  backHref,
  onMutated,
  adminLock,
  descInvalid,
}: {
  deficiencyId: string;
  round: number;
  nextHref?: string | null;
  remaining?: number;
  /** 無下一筆待審時審完跳回的「缺失與矯正」總覽 */
  backHref?: string | null;
  /** 就地展開面板(批47):審查完成後通知外層重抓面板(通過/退回後不再可審;詳情頁不傳=無副作用) */
  onMutated?: () => void;
  /** 最高管理員代委員審查:預設鎖定,需明確解鎖才顯示退回/通過(批48 圖3);委員本人不傳=不鎖 */
  adminLock?: boolean;
  /** 缺失內容仍為佔位文字/空白(server 端 isInvalidDeficiencyDescription 判定;批58):停用「審核通過」。
   *  後端 review route 亦擋 PASS——此處讓委員一眼看出「為何不能通過」,不再開彈窗按了才 400。 */
  descInvalid?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<'PASS' | 'RETURN' | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  // 最高管理員解鎖代審(預設鎖定;委員本人 adminLock=false 恆解鎖)
  const [unlocked, setUnlocked] = useState(false);
  const locked = !!adminLock && !unlocked;

  // 開啟對話框時重置意見,避免「取消退回再按通過」殘留文字被誤送
  function openDialog(kind: 'PASS' | 'RETURN') {
    setComment('');
    setOpen(kind);
  }

  function appendPhrase(p: string) {
    setComment((prev) => (prev.trim() ? `${prev.trim()}\n${p}` : p));
  }

  async function decide() {
    if (!open) return;
    if (open === 'RETURN' && comment.trim().length < 5) {
      toast.error('退回理由太短', '請具體說明需補正之處（至少 5 個字），機關才知道怎麼改');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/deficiencies/${deficiencyId}/action/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: open, comment: comment.trim() || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '審查失敗' }));
      toast.error('審查失敗', j.error);
      return;
    }
    const t = open === 'PASS' ? TOAST.passedAction() : TOAST.returnedAction();
    const more = remaining && remaining > 0 ? `還有 ${remaining} 筆待審，已為你開啟下一筆。` : undefined;
    toast.success(t.title, more ?? t.description);
    setOpen(null);
    setComment('');
    if (nextHref) {
      router.push(nextHref);
      router.refresh();
    } else if (backHref) {
      // 已審完最後一筆 → 回缺失與矯正總覽,讓委員確知本週期已無待審
      router.push(backHref);
      router.refresh();
    } else {
      router.refresh();
    }
    onMutated?.(); // 就地展開:審查已定案,通知外層重抓面板(批47)
  }

  return (
    <Card className="mb-6" variant="elevated">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>委員審查（第 {round} 輪）</CardTitle>
          <CardDescription>
            {locked
              ? '審查權責屬指派委員。最高管理員此功能預設鎖定，僅於特殊情況（如協助操作）才解鎖代為審查。'
              : '檢視下方機關填報內容與佐證後，決定本項矯正措施是否通過。'}
            {!locked && remaining != null && remaining > 0 && (
              <span className="text-primary-700">本週期還有 {remaining} 筆待審。</span>
            )}
            {adminLock && unlocked && (
              <span className="text-warning-700"> 目前為最高管理員代審模式。</span>
            )}
          </CardDescription>
        </div>
        {locked ? (
          <Button
            variant="tonal"
            leadingIcon={<Shield size={15} />}
            onClick={() => setUnlocked(true)}
          >
            解鎖以代為審查
          </Button>
        ) : (
          <div className="flex gap-2">
            {adminLock && (
              <Button variant="text" leadingIcon={<ShieldCheck size={15} />} onClick={() => setUnlocked(false)}>
                重新鎖定
              </Button>
            )}
            <Button variant="tonal" onClick={() => openDialog('RETURN')}>退回補正</Button>
            <Button
              onClick={() => openDialog('PASS')}
              disabled={descInvalid}
              title={descInvalid ? '缺失內容仍為佔位文字或空白，須由中心補述後才能通過' : undefined}
            >
              審核通過
            </Button>
          </div>
        )}
      </div>

      {/* 缺失內容為佔位/空白:停用通過並說明(批58)。內容須由中心補述;如有誤可先退回補正。 */}
      {!locked && descInvalid && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-warning-200 bg-warning-50 px-3.5 py-2.5 text-body-sm text-warning-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>此缺失內容仍為佔位文字或空白，須由中心補述實際缺失內容後，才能審核通過。</span>
        </div>
      )}

      <ConfirmDialog
        open={open === 'PASS'}
        onOpenChange={(o) => !saving && !o && setOpen(null)}
        title="審核通過"
        description={
          <div className="mt-2 flex flex-col gap-3">
            <p className="text-body-sm text-ink-500">確認本項矯正措施已符合要求？</p>
            <Textarea
              label="審查意見（選填）"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
            <div className="flex flex-wrap gap-1.5">
              {PASS_PHRASES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => appendPhrase(p)}
                  className="text-caption px-2.5 py-1 rounded-full border border-neutral-400 text-ink-500 hover:border-neutral-500 hover:text-ink-900 hover:bg-paper-sunk transition-colors"
                >
                  + {p}
                </button>
              ))}
            </div>
          </div>
        }
        confirmLabel="通過"
        tone="primary"
        onConfirm={decide}
        loading={saving}
      />
      <ConfirmDialog
        open={open === 'RETURN'}
        onOpenChange={(o) => !saving && !o && setOpen(null)}
        title="退回補正"
        description={
          <div className="mt-2 flex flex-col gap-3">
            <Textarea
              label="退回理由（必填，至少 5 字）"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="例：佐證文件不足，請補附設定變更紀錄與留存驗證畫面…"
            />
            <div className="flex flex-wrap gap-1.5">
              {RETURN_PHRASES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => appendPhrase(p)}
                  className="text-caption px-2.5 py-1 rounded-full border border-neutral-400 text-ink-500 hover:border-neutral-500 hover:text-ink-900 hover:bg-paper-sunk transition-colors"
                >
                  + {p.slice(0, 12)}…
                </button>
              ))}
            </div>
          </div>
        }
        confirmLabel="退回"
        tone="danger"
        onConfirm={decide}
        loading={saving}
      />
    </Card>
  );
}
