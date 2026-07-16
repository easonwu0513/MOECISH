'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { AlertTriangle, Info, ChevronRight, ChevronDown } from '@/components/icons';
import { ACTION_STATUS_LABELS, type ActionStatus, type DeficiencyType } from '@/lib/types';
import { actionStatusTone } from '@/lib/state-machine';
import { toneClasses } from '@/lib/stage';
import ActionForm, { type ActionData } from './[defId]/ActionForm';
import ReviewPanel from './[defId]/ReviewPanel';
import ReviewerAssign from './[defId]/ReviewerAssign';

/**
 * 缺失就地展開(批47):點缺失列不再換頁,直接在該列下方展開矯正措施填報/審查,
 * 方便逐筆檢查撰寫內容並快速切換。採「聚焦展開」——同時只開一筆(context 共享 openId)。
 * 面板資料由 /api/deficiencies/[id]/panel 依角色範圍延遲載入(與詳情頁同權限/同語彙)。
 */
const AccordionCtx = createContext<{
  openId: string | null;
  setOpenId: (id: string | null) => void;
}>({ openId: null, setOpenId: () => {} });

export function DeficiencyAccordionProvider({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return <AccordionCtx.Provider value={{ openId, setOpenId }}>{children}</AccordionCtx.Provider>;
}

/**
 * 構面分組可收合 section:策略/管理/技術三面各為一個可展開收合區塊,點標頭可手動收合。
 * 批57 起所有角色一律預設展開(原批48 圖7 對機關預設收合易讓其誤以為沒缺失);
 * defaultCollapsed prop 保留供向後相容,缺失清單頁已不再傳入。
 */
export function DeficiencyAspectSection({
  title,
  improveN,
  suggestN,
  defaultCollapsed,
  children,
}: {
  title: string;
  improveN: number;
  suggestN: number;
  defaultCollapsed?: boolean;
  children?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed);
  const total = improveN + suggestN;
  return (
    <section>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="w-full flex items-center justify-between gap-3 py-1.5 text-left focus-ring rounded-md"
      >
        <h2 className="text-title-lg text-ink-900">{title}</h2>
        <span className="flex items-center gap-2.5 shrink-0">
          <span className="text-caption text-ink-500 tabular-nums">
            {total === 0 ? '無缺失' : `待改善 ${improveN}・建議 ${suggestN}`}
          </span>
          <ChevronDown
            size={18}
            className={cn('text-ink-500 transition-transform', collapsed && '-rotate-90')}
            aria-hidden
          />
        </span>
      </button>
      {!collapsed &&
        (total === 0 ? (
          <p className="mt-2 mb-1 text-body-sm text-ink-500">此構面目前無缺失事項。</p>
        ) : (
          <div className="mt-4">{children}</div>
        ))}
    </section>
  );
}

type PanelData = {
  type: DeficiencyType;
  description: string;
  checklistRef: string | null;
  status: ActionStatus;
  canFill: boolean;
  canReview: boolean;
  /** 缺失內容仍為佔位/空白:委員不可審核通過(批58) */
  descInvalid: boolean;
  reviewerIsAdmin: boolean;
  viewOnly: boolean;
  orgReadonlyReason: string | null;
  round: number;
  latestReturnComment: string | null;
  action: ActionData | null;
  // 審閱委員指派(僅中心 SUPER_ADMIN;批57):就地面板亦可指派,免每筆開完整詳情頁
  isSuperAdmin: boolean;
  reviewerAuditorId: string | null;
  assignableReviewers: { id: string; name: string }[];
};

export function DeficiencyRow({
  cycleId,
  id,
  itemNo,
  description,
  checklistRef,
  status,
  round,
  missingFields,
}: {
  cycleId: string;
  id: string;
  itemNo: number;
  description: string;
  checklistRef: string | null;
  status: ActionStatus;
  round: number;
  /** 機關視角:未填完整時尚缺的欄位清單(有值即在列上標「未填完整・尚缺 X」);批57 */
  missingFields?: string[];
}) {
  const { openId, setOpenId } = useContext(AccordionCtx);
  const open = openId === id;

  return (
    <Card interactive padded={false} className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpenId(open ? null : id)}
        aria-expanded={open}
        className="group w-full flex text-left focus-ring rounded-md"
      >
        {/* 左緣狀態色條(顏色非唯一訊號,右側仍有 Chip+dot+文字) */}
        <div
          className={`w-1.5 self-stretch shrink-0 ${toneClasses(actionStatusTone(status)).dot}`}
          aria-hidden
        />
        <div className="flex-1 flex items-center gap-4 p-4 sm:p-5">
          <span className="w-9 h-9 rounded-md bg-paper-sunk flex items-center justify-center text-title text-ink-500 tabular-nums shrink-0">
            {itemNo}
          </span>
          <div className="flex-1 min-w-0">
            <p className={cn('text-body-sm text-ink-500 leading-relaxed', !open && 'line-clamp-2')}>
              {description}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              {checklistRef && (
                <span className="text-caption font-mono text-ink-500">檢核項 {checklistRef}</span>
              )}
              {round > 1 && <span className="text-caption text-ink-500">第 {round} 輪</span>}
            </div>
            {/* 機關視角:未填完整提示(批57)——按鈕送出只送完整項,此列標出尚缺欄位 */}
            {missingFields && missingFields.length > 0 && (
              <p className="mt-1 text-caption text-danger-700">
                未填完整・尚缺：{missingFields.join('、')}
              </p>
            )}
          </div>
          <Chip tone={actionStatusTone(status)} size="sm" dot>
            {ACTION_STATUS_LABELS[status]}
          </Chip>
          <ChevronRight
            size={16}
            className={cn('text-ink-500 shrink-0 transition-transform', open && 'rotate-90')}
            aria-hidden
          />
        </div>
      </button>
      {open && <DeficiencyPanel cycleId={cycleId} deficiencyId={id} />}
    </Card>
  );
}

function DeficiencyPanel({ cycleId, deficiencyId }: { cycleId: string; deficiencyId: string }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deficiencies/${deficiencyId}/panel`, { cache: 'no-store' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || '載入失敗');
      }
      setData((await res.json()) as PanelData);
    } catch {
      setError('載入失敗，請檢查網路或稍後再試。');
    } finally {
      setLoading(false);
    }
  }, [deficiencyId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="border-t border-rule bg-paper-sunk/40 px-4 py-4 sm:px-5 sm:py-5">
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-body-sm text-ink-500">
          <Spinner size={16} />
          載入中…
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-body-sm text-ink-500">{error}</p>
          <Button variant="tonal" size="sm" onClick={load}>
            重新載入
          </Button>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-4">
          {/* 缺失原文全文(展開即讀,免翻頁對照) */}
          <div>
            <p className="text-label text-ink-500 mb-1">
              {data.type === 'IMPROVE' ? '待改善事項' : '建議事項'}
            </p>
            <p className="text-body-sm text-ink-900 leading-relaxed whitespace-pre-wrap">
              {data.description}
            </p>
          </div>

          {/* 審閱委員指派(僅中心 SUPER_ADMIN;批57):就地面板即可指派/改指派,免每筆點進完整詳情頁。
              後端 reviewer route 自帶 requireRole('SUPER_ADMIN'),前端僅呈現;存檔後重抓面板反映最新指派。 */}
          {data.isSuperAdmin && (
            <div className="rounded-md border border-rule bg-card px-3.5 py-3">
              <p className="text-label text-ink-500 mb-2">審閱委員</p>
              <ReviewerAssign
                deficiencyId={deficiencyId}
                authors={data.assignableReviewers}
                current={data.reviewerAuditorId}
                onSaved={load}
              />
            </div>
          )}

          {/* 退回補正:最新退回意見置頂 */}
          {data.status === 'RETURNED' && data.latestReturnComment && (
            <div className="rounded-md border border-danger-200 bg-danger-50 p-3.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-danger-700 mt-0.5 shrink-0" aria-hidden />
                <div className="min-w-0">
                  <p className="text-label text-danger-700">委員退回意見</p>
                  <p className="mt-1 text-body-sm text-danger-700/90 leading-relaxed whitespace-pre-wrap">
                    {data.latestReturnComment}
                  </p>
                  <p className="mt-1.5 text-caption text-danger-600/80">
                    請依意見補正下方矯正措施與佐證後重新送審。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 機關唯讀原因說明 */}
          {data.orgReadonlyReason && (
            <div className="flex items-start gap-2 rounded-md bg-card px-3.5 py-2.5 text-caption text-ink-500">
              <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>{data.orgReadonlyReason}</span>
            </div>
          )}

          {/* 委員審查面板(送審狀態 + 委員身分);審完 onMutated 重抓面板 */}
          {data.canReview && data.action && (
            <ReviewPanel
              key={`review-${data.status}-${data.round}`}
              deficiencyId={deficiencyId}
              round={data.action.round}
              onMutated={load}
              adminLock={data.reviewerIsAdmin}
              descInvalid={data.descInvalid}
            />
          )}

          {/* 矯正措施表單 / 唯讀檢視;送出後 onMutated 重抓面板改唯讀 */}
          <ActionForm
            key={`action-${data.status}-${data.round}`}
            deficiencyId={deficiencyId}
            action={data.action}
            editable={data.canFill}
            viewOnly={data.viewOnly}
            onMutated={load}
            roundSubmit={data.canFill}
          />

          {/* 完整詳情:就地面板僅涵蓋填報/審查;來源檢核項、歷年同類、審閱指派仍在詳情頁 */}
          <div className="pt-0.5">
            <Link
              href={`/cycles/${cycleId}/deficiencies/${deficiencyId}`}
              className="inline-flex items-center gap-1 text-label-lg font-medium text-primary-700 hover:underline focus-ring rounded-sm"
            >
              開啟完整詳情（來源檢核項・歷年同類・審閱指派）
              <ChevronRight size={15} aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
