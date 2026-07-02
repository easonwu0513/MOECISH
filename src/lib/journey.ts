import type { Role, JourneyScope } from './types';
import type { JourneyClientStage } from '@/components/journey/JourneyChecklist';
import { prisma } from './db';
import { autoItemDone, journeyItemHref, cycleStageReached, type JourneyAutoCtx } from './journey-auto';

/**
 * 引導式精靈（Guided Journey）資料層 SoT。
 * 把「範本（Template→Stage→Item，可編輯）」與「進度（Progress，可勾選）」合併成單一視圖，
 * 供週期頁（CYCLE）、中心年度 runbook（PROGRAMME）、後台編輯器共用，避免多處各自查詢/合併。
 */

export type JourneyItemView = {
  id: string;
  title: string;
  hint: string | null;
  role: Role | null;
  orderIndex: number;
  /** 純提醒項(informational 欄位):不勾選、不計分;可有跳轉。 */
  informational: boolean;
  /** CYCLE「必做・手動勾選」項(無 autoKey 且非純提醒):完成靠 JourneyProgress 手動勾選。 */
  manual: boolean;
  done: boolean;
  doneAt: Date | null;
  doneByName: string | null;
  note: string | null;
  href: string | null; // CYCLE:快捷跳轉到實際執行頁;PROGRAMME / 純提醒 / 未到階段:null
  /** CYCLE:該階段尚未到達時帶階段標題(點擊改提示「尚未開放」而非跳轉);已到達為 null。 */
  lockedStageTitle: string | null;
};

export type JourneyStageView = {
  id: string;
  stageKey: string;
  title: string;
  summary: string | null;
  orderIndex: number;
  items: JourneyItemView[];
  doneCount: number;
  total: number;
};

export type JourneyView = {
  templateId: string;
  scope: JourneyScope;
  title: string;
  stages: JourneyStageView[];
  doneCount: number;
  total: number;
};

/**
 * 載入某 scope 的精靈視圖並合併進度。
 * - CYCLE：傳 cycleId；可選 role（限定該角色 + 全體 null 項，給機關/委員聚焦；中心不傳 = 看全部）。
 * - PROGRAMME：傳 programmeYear。
 * 回傳 null 代表該 scope 尚無範本（未 seed）。
 */
export async function loadJourney(opts: {
  scope: JourneyScope;
  cycleId?: string;
  programmeYear?: number;
  role?: Role;
  /** CYCLE 專用:傳入週期實況,完成度由系統自動判定(不靠 JourneyProgress)。 */
  autoCtx?: JourneyAutoCtx;
}): Promise<JourneyView | null> {
  const { scope, cycleId, programmeYear, role, autoCtx } = opts;

  // 進度過濾條件：CYCLE 綁 cycleId、PROGRAMME 綁 programmeYear。
  const progressWhere =
    scope === 'CYCLE' ? { cycleId: cycleId ?? '__none__' } : { programmeYear: programmeYear ?? -1 };

  const template = await prisma.journeyTemplate.findUnique({
    where: { scope },
    include: {
      stages: {
        orderBy: { orderIndex: 'asc' },
        include: {
          items: {
            orderBy: { orderIndex: 'asc' },
            include: { progress: { where: progressWhere } },
          },
        },
      },
    },
  });
  if (!template) return null;

  let grandDone = 0;
  let grandTotal = 0;

  const stages: JourneyStageView[] = template.stages.map((st) => {
    const items: JourneyItemView[] = st.items
      .filter((it) => (role ? it.role == null || it.role === role : true))
      .map((it) => {
        // 完成判定三型(informational 欄位為 SoT,取代舊「無 autoKey 即純提醒」推導):
        //   autoKey 非空 → 系統自動;autoKey 空 + informational=false → 必做・手動勾選;informational=true → 純提醒
        if (scope === 'CYCLE') {
          const informational = it.informational;
          const manual = !informational && it.autoKey == null;
          // 跳轉:編輯器覆寫(it.href,''=週期主頁)優先,否則依 autoKey/標題/階段推導
          const overridden = it.href != null;
          const sub = cycleId ? (overridden ? it.href : journeyItemHref(st.stageKey, it.autoKey, it.title)) : null;
          const status = autoCtx?.facts.status;
          // 已到達該階段才連結到實際頁面;未到達者不連結,點擊改提示「尚未開放」(避免被導回週期頁誤解為壞掉)
          const reached = status ? cycleStageReached(st.stageKey, status) : true;
          // 純提醒:推導值僅在有具體子頁時才連(避免連回本頁無動作);編輯器明示指定(含週期主頁)則尊重。
          const linkable = reached && !!cycleId && (informational && !overridden ? !!sub : true);
          const p = it.progress[0];
          return {
            id: it.id,
            title: it.title,
            hint: it.hint,
            role: (it.role as Role | null) ?? null,
            orderIndex: it.orderIndex,
            informational,
            manual,
            done: informational
              ? false
              : it.autoKey
                ? !!autoCtx && autoItemDone(st.stageKey, it.autoKey, autoCtx)
                : !!p?.done,
            doneAt: manual ? p?.doneAt ?? null : null,
            doneByName: manual ? p?.doneByName ?? null : null,
            note: null,
            href: linkable ? `/cycles/${cycleId}${sub ?? ''}` : null,
            lockedStageTitle: reached ? null : st.title,
          };
        }
        const p = it.progress[0];
        const programmeInfo = it.informational;
        return {
          id: it.id,
          title: it.title,
          hint: it.hint,
          role: (it.role as Role | null) ?? null,
          orderIndex: it.orderIndex,
          informational: programmeInfo,
          manual: !programmeInfo,
          done: !programmeInfo && !!p?.done,
          doneAt: p?.doneAt ?? null,
          doneByName: p?.doneByName ?? null,
          note: p?.note ?? null,
          href: null,
          lockedStageTitle: null,
        };
      });
    // 純提醒項不算「任務」,不計入 X/Y 進度
    const countable = items.filter((i) => !i.informational);
    const doneCount = countable.filter((i) => i.done).length;
    grandDone += doneCount;
    grandTotal += countable.length;
    return {
      id: st.id,
      stageKey: st.stageKey,
      title: st.title,
      summary: st.summary,
      orderIndex: st.orderIndex,
      items,
      doneCount,
      total: countable.length,
    };
  });

  return {
    templateId: template.id,
    scope: scope,
    title: template.title,
    stages,
    doneCount: grandDone,
    total: grandTotal,
  };
}

/**
 * 是否可勾選某項（細粒度授權；CYCLE 另需先過 assertCycleAccess 確認週期存取）。
 * - PROGRAMME：僅最高管理員。
 * - CYCLE：最高管理員全可；其餘僅可勾「全體（null）或自己角色」的項目。
 */
export function canToggleJourneyItem(role: Role, scope: JourneyScope, itemRole: string | null): boolean {
  if (scope === 'PROGRAMME') return role === 'SUPER_ADMIN';
  if (role === 'SUPER_ADMIN') return true;
  return itemRole == null || itemRole === role;
}

/** 將 JourneyView 轉為前端可序列化的階段資料（含逐項 canToggle，避免把 prisma 帶進 client）。 */
export function toClientStages(view: JourneyView, role: Role): JourneyClientStage[] {
  return view.stages.map((s) => ({
    id: s.id,
    stageKey: s.stageKey,
    title: s.title,
    summary: s.summary,
    items: s.items.map((it) => ({
      id: it.id,
      title: it.title,
      hint: it.hint,
      role: it.role,
      done: it.done,
      doneByName: it.doneByName,
      href: it.href,
      informational: it.informational,
      lockedStageTitle: it.lockedStageTitle,
      // 系統自動項與純提醒項唯讀;「必做・手動勾選」項(CYCLE/PROGRAMME 皆同)依角色可勾。
      canToggle: it.manual && canToggleJourneyItem(role, view.scope, it.role),
    })),
  }));
}
