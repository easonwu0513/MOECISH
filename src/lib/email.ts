import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './db';
import { isGraphConfigured, sendGraphMail } from './graph-mail';
import { STORAGE_DIR } from './storage';

export type EmailKind =
  | 'invitation'
  | 'cycle-notify'
  | 'tracking'
  | 'track-remind'     // 中心落後列一鍵催辦(有別於一般 tracking / 自動催繳排程,故獨立 kind 以構成純淨的 per-cycle 催辦軌跡)
  | 'password-reset'
  | 'review-request'   // 機關送審 → 通知委員
  | 'action-returned'  // 委員退回 → 通知機關
  | 'all-passed'       // 全數通過 → 通知機關用印
  | 'checklist-submitted' // 檢核表填報送出 → 通知中心(審核)
  | 'committee-review'    // 資料齊備 → 通知委員開始審閱
  | 'observer-paired'     // 觀察員受配對為某週期觀察員 → 通知該觀察員(批66 M2)
  | 'observer-review-open' // 資料齊備 / 設定觀察員審閱窗口 → 通知本週期配對觀察員可檢視(批66 M2)
  | 'review-window-request' // 委員求援:審閱時段未設 → 通知中心設定
  | 'checklist-reopened'  // 檢核表退回重填 → 通知機關
  | 'signed-report-submitted' // 機關確認繳交用印掃描檔 → 通知中心
  | 'signed-report-returned'  // 中心退回用印掃描檔(解除鎖定)→ 站內通知機關重新上傳
  | 'prep-submitted'      // 機關確定繳交稽核前資料 → 通知中心
  | 'prep-returned'       // 中心退回稽核前資料 → 通知機關
  | 'checklist-review-done' // 委員完成檢核表審閱意見 → 通知中心
  | 'audit-score-lock'    // 委員確認填寫完畢、鎖定實地稽核評分/發現 → 通知中心
  | 'audit-score-unlock'  // 委員解除實地稽核評分/發現鎖定、修改 → 通知中心
  | 'audit-score-return'  // 最高管理員退件 → 通知該委員(解除鎖定、請重新編輯)
  | 'tracked-created'     // 缺失拋轉持續列管 → 通知機關(批71)
  | 'tracked-report'      // 機關送出列管回報 → 通知中心(+協審委員)(批71)
  | 'tracked-reviewed'    // 中心/協審委員審核列管回報 → 通知機關(批71)
  | 'tracked-due'         // 列管回報到期/逾期催辦(timer;機關+逾期14天通知中心)(批72)
  | 'presurvey-remind'    // 事前場次調查催辦(中心催委員/觀察員填意願)(批A)
  | 'presurvey-doc-return' // 事前場次調查文件退補(中心退回受調者文件)(批B)
  | 'health-alert'        // 系統健康警報(監控)
  | 'other';

export type SendEmailInput = {
  to: string;
  toName?: string;
  subject: string;
  body: string;        // plain text
  kind?: EmailKind;
  context?: Record<string, unknown>;
  relatedInvitationId?: string;
  relatedCycleId?: string;
  /** 站內通知點擊去處覆寫;不給則預設為 /cycles/{relatedCycleId}(或 null)。 */
  notificationLink?: string;
  /** 去重鍵:同 kind+to+dedupeKey 在 24h 內已真寄成功過則跳過(防轟炸)。不給 = 不去重。 */
  dedupeKey?: string;
};

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 寄信主通道:
 * 1. 永遠寫入 EmailLog(管理介面可查)
 * 2. Graph token 已初始化 → 經 moecish@ 真實寄出(失敗不擋業務流程,記錄錯誤)
 * 3. 未初始化 → 僅記錄(信件以 .txt 落地供檢視),context 標記 simulated
 * 4. dedupeKey 有給且 24h 內同 kind+收件人+鍵已寄成功 → 跳過(EmailLog 記 skipped)
 */
export async function sendEmail(input: SendEmailInput) {
  const kind: EmailKind = input.kind ?? 'other';

  // 系統信一律附「請勿直接回信」footer(避免委員/機關直接回覆系統信箱)。
  // 只加到對外送信與 EmailLog/.txt 紀錄;站內通知摘要仍取原始 input.body(notificationSummary),footer 不會污染鈴鐺。
  const FOOTER =
    '\n\n──────────\n此封信為系統自動寄發，請勿直接回信。如有疑問請登入平台，或洽教育部轄下醫療領域資訊安全推動中心。';
  // 冪等:body 若已含 footer(如後台重寄讀 EmailLog.body 再進 sendEmail)不重複附加,避免雙重 footer。
  const outboundBody = input.body.includes('此封信為系統自動寄發') ? input.body : `${input.body}${FOOTER}`;

  // 通知節流:重複觸發(例:連續點送出、排程重跑)不重複轟炸收件人
  if (input.dedupeKey) {
    const dup = await prisma.emailLog.findFirst({
      where: {
        kind,
        toEmail: input.to,
        sentAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
        context: { contains: `"dedupeKey":${JSON.stringify(input.dedupeKey)}` },
      },
      orderBy: { sentAt: 'desc' },
    });
    if (dup) {
      try {
        const c = dup.context ? JSON.parse(dup.context) : {};
        if (c.delivery === 'sent' || c.delivery === 'simulated') {
          return prisma.emailLog.create({
            data: {
              toEmail: input.to,
              toName: input.toName ?? null,
              subject: input.subject,
              body: outboundBody,
              kind,
              status: 'skipped',
              context: JSON.stringify({
                ...(input.context ?? {}),
                dedupeKey: input.dedupeKey,
                delivery: 'skipped',
                skippedBecause: dup.id,
              }),
              relatedInvitationId: input.relatedInvitationId ?? null,
              relatedCycleId: input.relatedCycleId ?? null,
            },
          });
        }
      } catch { /* context 解析失敗就照常寄 */ }
    }
  }

  const graphReady = await isGraphConfigured();
  let delivery: 'sent' | 'failed' | 'simulated' = 'simulated';
  let deliveryError: string | undefined;

  if (graphReady) {
    try {
      await sendGraphMail({
        to: input.to,
        toName: input.toName,
        subject: input.subject,
        bodyText: outboundBody,
      });
      delivery = 'sent';
    } catch (e) {
      delivery = 'failed';
      deliveryError = (e as Error).message;
      console.error('[email] Graph 寄送失敗：', deliveryError);
    }
  }

  const log = await prisma.emailLog.create({
    data: {
      toEmail: input.to,
      toName: input.toName ?? null,
      subject: input.subject,
      body: outboundBody,
      kind,
      status: delivery,
      context: JSON.stringify({
        ...(input.context ?? {}),
        ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
        delivery,
        ...(deliveryError ? { deliveryError } : {}),
      }),
      relatedInvitationId: input.relatedInvitationId ?? null,
      relatedCycleId: input.relatedCycleId ?? null,
    },
  });

  // 個資保護:正式環境不另外落地含姓名/Email/內文的明文信件副本
  // (DB EmailLog 已是唯一真實來源);僅在非正式環境保留 .txt 供開發/示範檢視。
  if (process.env.NODE_ENV !== 'production') try {
    const dir = path.join(STORAGE_DIR, 'emails');
    await mkdir(dir, { recursive: true });
    const safeSubject = input.subject.replace(/[^\w\-一-鿿]/g, '_').slice(0, 40);
    const fileName = `${log.sentAt.toISOString().replace(/[:.]/g, '-')}_${safeSubject}_${log.id.slice(-6)}.txt`;
    const content =
      `To: ${input.toName ? `${input.toName} <${input.to}>` : input.to}\n` +
      `Kind: ${kind}\n` +
      `Delivery: ${delivery}${deliveryError ? ` (${deliveryError})` : ''}\n` +
      `Sent: ${log.sentAt.toISOString()}\n` +
      `Subject: ${input.subject}\n` +
      `${input.relatedInvitationId ? `Invitation: ${input.relatedInvitationId}\n` : ''}` +
      `${input.relatedCycleId ? `Cycle: ${input.relatedCycleId}\n` : ''}` +
      `\n${outboundBody}\n`;
    await writeFile(path.join(dir, fileName), content, 'utf-8');
  } catch (e) {
    console.warn('[email] failed to write log file:', (e as Error).message);
  }

  // 站內通知(鈴鐺):寄信對象若為系統使用者,同步建立站內通知,避免委員/機關漏看 email。
  // (失敗不擋寄信流程;dedupe 跳過的信不會走到這裡,故不會重複通知)
  try {
    const u = await prisma.user.findUnique({ where: { email: input.to }, select: { id: true, isActive: true } });
    if (u?.isActive) {
      await prisma.notification.create({
        data: {
          userId: u.id,
          kind,
          title: input.subject.replace(/^\[MOECISH\]\s*/, ''),
          body: notificationSummary(input.body),
          link: input.notificationLink ?? (input.relatedCycleId ? `/cycles/${input.relatedCycleId}` : null),
        },
      });
    }
  } catch (e) {
    console.warn('[email] 站內通知建立失敗：', (e as Error).message);
  }

  return log;
}

/** 從信件內文取「主要內容段」當站內通知摘要(略過稱呼、連結、署名),截斷至 160 字。 */
function notificationSummary(body: string): string {
  const paras = body.split('\n\n').map((p) => p.trim()).filter(Boolean);
  const main = paras.find(
    (p) => !/您好[,，]?$/.test(p) && !p.startsWith('http') && !p.startsWith('—'),
  );
  return (main ?? paras[0] ?? '').replace(/\s+/g, ' ').slice(0, 160);
}
