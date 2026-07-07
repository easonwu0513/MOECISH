/**
 * 公告生命週期單一來源(批33):引入「排程上下架」後,`status === 'PUBLISHED'` 不再等於
 * 「前台可見」——可見還需 上架時間已到(publishedAt <= now)且 未到排定下架(unpublishAt)。
 * 所有前台查詢(首頁/新聞列表/內頁/附件下載)一律經此模組取判準,不得各自內聯 status 判斷
 * (與 access-policy 同一「漏一處即破口」教訓)。免排程器:以查詢時間窗判定,到時自然生效。
 *
 * 四態(管理端標籤列):
 *   草稿   = DRAFT(仍在編輯撰寫)
 *   待發布 = PUBLISHED 且上架時間未到(已排定發布日期但尚未到來)
 *   發布中 = PUBLISHED 且已上架且未下架(前台可見)
 *   已下架 = ARCHIVED(手動)或 PUBLISHED 且已過排定下架時間
 */

type PostLifecycleFields = {
  status: string;
  publishedAt: Date | null;
  unpublishAt: Date | null;
};

/** 前台可見的 Prisma where 片段(status+時間窗)。 */
export function publicPostWhere(now: Date = new Date()) {
  return {
    status: 'PUBLISHED',
    publishedAt: { lte: now },
    OR: [{ unpublishAt: null }, { unpublishAt: { gt: now } }],
  };
}

/** 單筆判定(附件下載/內頁等已取回實體時用;與 publicPostWhere 同義)。 */
export function postPubliclyVisible(p: PostLifecycleFields, now: Date = new Date()): boolean {
  return (
    p.status === 'PUBLISHED' &&
    p.publishedAt != null &&
    p.publishedAt.getTime() <= now.getTime() &&
    (p.unpublishAt == null || p.unpublishAt.getTime() > now.getTime())
  );
}

export type PostLifecycle = 'draft' | 'scheduled' | 'live' | 'off';

export function postLifecycle(p: PostLifecycleFields, now: Date = new Date()): PostLifecycle {
  if (p.status === 'DRAFT') return 'draft';
  if (p.status === 'ARCHIVED') return 'off';
  // PUBLISHED:先看是否已過排定下架,再看上架時間是否已到
  if (p.unpublishAt && p.unpublishAt.getTime() <= now.getTime()) return 'off';
  if (!p.publishedAt || p.publishedAt.getTime() > now.getTime()) return 'scheduled';
  return 'live';
}

export const POST_LIFECYCLE_LABELS: Record<PostLifecycle, string> = {
  draft: '草稿',
  scheduled: '待發布',
  live: '發布中',
  off: '已下架',
};

export const POST_LIFECYCLE_TONES: Record<PostLifecycle, 'neutral' | 'primary' | 'success' | 'warning'> = {
  draft: 'neutral',
  scheduled: 'primary',
  live: 'success',
  off: 'warning',
};
