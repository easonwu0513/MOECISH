import type { Role, JourneyScope } from './types';
import type { JourneyClientStage } from '@/components/journey/JourneyChecklist';
import { prisma } from './db';

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
  done: boolean;
  doneAt: Date | null;
  doneByName: string | null;
  note: string | null;
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
}): Promise<JourneyView | null> {
  const { scope, cycleId, programmeYear, role } = opts;

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
        const p = it.progress[0];
        return {
          id: it.id,
          title: it.title,
          hint: it.hint,
          role: (it.role as Role | null) ?? null,
          orderIndex: it.orderIndex,
          done: !!p?.done,
          doneAt: p?.doneAt ?? null,
          doneByName: p?.doneByName ?? null,
          note: p?.note ?? null,
        };
      });
    const doneCount = items.filter((i) => i.done).length;
    grandDone += doneCount;
    grandTotal += items.length;
    return {
      id: st.id,
      stageKey: st.stageKey,
      title: st.title,
      summary: st.summary,
      orderIndex: st.orderIndex,
      items,
      doneCount,
      total: items.length,
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
      canToggle: canToggleJourneyItem(role, view.scope, it.role),
    })),
  }));
}
