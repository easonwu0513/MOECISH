import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import {
  SURVEY_AVAILABILITY_LABELS,
  SURVEY_REPLY_STATUS_LABELS,
  SURVEY_DOC_HANDOVER_LABELS,
  SURVEY_DOC_STATUS_LABELS,
  type SurveyAvailabilityStatus,
  type SurveyReplyStatus,
  type SurveyDocHandover,
  type SurveyDocStatus,
} from '@/lib/types';

/** CSV 單格跳脫:①防公式注入(Excel 對 = + - @ 開頭視為公式,前置單引號轉純文字);②含逗號/引號/換行時加雙引號並轉義。 */
function cell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
function parseArr(json: string | null): string[] {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * 匯出某年度某類別(委員/觀察員)管考清單為 CSV(批B;僅中心)。BOM + UTF-8,Excel 可直開。
 * 欄序:姓名, 類型, 文件繳交, 意願送出, [各場次 日期 地點], 最終場次, 意願回信, 文件交接, 交通, 飲食, 備註。
 */
export async function GET(req: Request) {
  try {
    await requireRole('SUPER_ADMIN');
    const url = new URL(req.url);
    const year = Number(url.searchParams.get('year'));
    const kind = url.searchParams.get('kind') === 'OBSERVER' ? 'OBSERVER' : 'MEMBER';
    if (!Number.isInteger(year)) {
      return new Response('year 參數不正確', { status: 400 });
    }

    const [sessions, participants, customCols] = await Promise.all([
      // UAT 圖2:與管考表/自助頁同序(辦理日期升冪、未定最後)
      prisma.surveySession.findMany({
        where: { year },
        orderBy: [{ date: { sort: 'asc', nulls: 'last' } }, { orderIndex: 'asc' }],
      }),
      prisma.surveyParticipant.findMany({
        where: { year, kind },
        include: {
          user: { select: { name: true } },
          availabilities: { select: { sessionId: true, status: true } },
          finalAssignments: { include: { session: { select: { name: true, date: true, needsTravel: true } } } },
        },
        orderBy: { invitedAt: 'asc' },
      }),
      prisma.surveyCustomColumn.findMany({ where: { year }, orderBy: { orderIndex: 'asc' } }),
    ]);

    const parseObj = (json: string | null): Record<string, string> => {
      if (!json) return {};
      try {
        const o = JSON.parse(json);
        return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, string>) : {};
      } catch {
        return {};
      }
    };

    const md = (d: Date | null) => {
      if (!d) return '待定';
      const t = new Date(d.getTime() + 8 * 3600 * 1000);
      const [, m, day] = t.toISOString().slice(0, 10).split('-');
      return `${Number(m)}/${Number(day)}`;
    };

    const header = [
      '姓名',
      '類型',
      '文件繳交',
      '意願送出',
      ...sessions.map((s) => `${md(s.date)} ${s.name}`),
      '最終場次',
      '意願回信',
      '文件交接',
      '交通',
      '飲食',
      '備註',
      '電子郵件',
      '聯絡電話',
      '次要信箱',
      '次要電話',
      '代理人姓名/職稱',
      '代理聯絡人信箱',
      '代理聯絡人電話',
      ...customCols.map((c) => c.title),
    ];

    const rows = participants.map((p) => {
      const availMap = new Map(p.availabilities.map((a) => [a.sessionId, a.status]));
      const finalLabels = p.finalAssignments.map((fa) => `${md(fa.session.date)} ${fa.session.name}`);
      const custom = parseObj(p.customValues);
      return [
        p.user.name,
        p.committeeType ?? (kind === 'OBSERVER' ? '觀察員' : ''),
        SURVEY_DOC_STATUS_LABELS[p.docStatus as SurveyDocStatus] ?? p.docStatus,
        p.submittedAt ? '已送出' : '未送出',
        ...sessions.map((s) => {
          const st = availMap.get(s.id) as SurveyAvailabilityStatus | undefined;
          // ?? st 保底:舊制殘留值(如已移除的 PENDING)不致印出 "undefined";與其他欄位一致。
          return st ? (SURVEY_AVAILABILITY_LABELS[st] ?? st) : '未填寫';
        }),
        finalLabels.join(' / '),
        SURVEY_REPLY_STATUS_LABELS[p.replyStatus as SurveyReplyStatus] ?? p.replyStatus,
        SURVEY_DOC_HANDOVER_LABELS[p.docHandover as SurveyDocHandover] ?? p.docHandover,
        // UAT 圖14:交通逐場次(「場次:選項」;線上場次不列)
        p.finalAssignments
          .filter((fa) => fa.session.needsTravel)
          .map((fa) => {
            const arr = parseArr(fa.transport);
            return `${fa.session.name}：${arr.length > 0 ? arr.join('、') : '未填'}`;
          })
          .join(' / '),
        parseArr(p.diet).join(' / '),
        (p.note ?? '') + (p.travelNote ? ` / 差旅備註：${p.travelNote}` : ''),
        p.email ?? '',
        p.phone ?? '',
        p.email2 ?? '',
        p.phone2 ?? '',
        p.proxyName ?? '',
        p.proxyEmail ?? '',
        p.proxyPhone ?? '',
        ...customCols.map((c) => custom[c.id] ?? ''),
      ].map((v) => cell(String(v)));
    });

    const csv = '﻿' + [header.map(cell), ...rows].map((r) => r.join(',')).join('\r\n');
    const yearROC = year - 1911;
    const kindLabel = kind === 'OBSERVER' ? '觀察員' : '委員';
    // 副檔名以獨立字串串接,避免 punct-lint 誤把中文字串內的「.csv」全形化成「。csv」(見 punct-lint 教訓)
    const filename = `${yearROC}年度事前場次調查_${kindLabel}管考清單` + '.csv';

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
