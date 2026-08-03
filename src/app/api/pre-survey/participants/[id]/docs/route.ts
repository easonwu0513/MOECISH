import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { saveBuffer, deleteFileByKey } from '@/lib/storage';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { loadParticipantForAccess, assertSurveyYearWritable } from '@/lib/pre-survey-server';
import { canEditAvailability, stage1WindowFor, YEAR_WINDOWS_SELECT } from '@/lib/pre-survey-window';
import { sniffDocType } from '@/lib/pre-survey-files';

const SlotSchema = z.enum(['CV', 'NDA', 'RECEIPT']); // RECEIPT=觀察員差旅費領據(UAT 圖30;年度開關制)

/**
 * 上傳個人文件(批B):CV=經歷說明書(僅委員)、NDA=聘任同意暨保密切結書。本人或中心可傳。
 *  - 已送審(docStatus=SUBMITTED)鎖定,不可再傳(需中心退補後);中心不受此限。
 *  - 一槽一檔:重新上傳同槽會取代舊檔(刪實體+DB 列)。僅接受 PDF/JPG/PNG(magic-byte 驗真型別,不加浮水印)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, participant, isAdmin } = await loadParticipantForAccess(params.id);
    assertSurveyYearWritable(participant.year); // UAT 圖57:歷年資料唯讀

    if (!isAdmin && participant.docStatus === 'SUBMITTED') {
      return NextResponse.json({ error: '文件已送審，如需修改請待中心退補後再上傳。' }, { status: 400 });
    }

    // UAT 圖7/41:文件上傳與意願共用第一時窗(依身分取窗;中心不受限、editUnlocked 豁免)
    if (!isAdmin) {
      const win = await prisma.surveyFillWindow.findUnique({
        where: { year: participant.year },
        select: YEAR_WINDOWS_SELECT,
      });
      if (!canEditAvailability(stage1WindowFor(win, participant.kind), participant.editUnlocked, new Date())) {
        return NextResponse.json({ error: '文件上傳未在開放時間內；如需補件，請聯絡中心開放。' }, { status: 403 });
      }
    }

    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    const slotParsed = SlotSchema.safeParse(String(fd.get('slot') ?? ''));
    if (!file) return NextResponse.json({ error: '缺少檔案' }, { status: 400 });
    if (!slotParsed.success) return NextResponse.json({ error: '文件類別不正確' }, { status: 400 });
    const slot = slotParsed.data;

    if (slot === 'CV' && participant.kind !== 'MEMBER') {
      return NextResponse.json({ error: '觀察員無須繳交經歷說明書' }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案超過 20MB 上限' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const realMime = sniffDocType(buf);
    if (!realMime) {
      return NextResponse.json(
        { error: '僅接受 PDF / JPG / PNG 檔；Word、Excel 等請先另存為 PDF 再上傳。' },
        { status: 400 },
      );
    }

    const targetType = slot === 'CV' ? 'SURVEY_CV' : slot === 'RECEIPT' ? 'SURVEY_RECEIPT' : 'SURVEY_NDA';

    // UAT 圖30/36:領據上傳僅觀察員(年度開關制);委員領據改寄信收送,不走系統上傳
    if (slot === 'RECEIPT') {
      if (participant.kind !== 'OBSERVER') {
        return NextResponse.json({ error: '委員領據以寄信方式收送，不於系統上傳。' }, { status: 400 });
      }
      const win = await prisma.surveyFillWindow.findUnique({
        where: { year: participant.year },
        select: { observerReceiptEnabled: true },
      });
      if (!win?.observerReceiptEnabled) {
        return NextResponse.json({ error: '本年度未開放填寫差旅費領據。' }, { status: 400 });
      }
    }

    // 取代同槽舊檔:先寫新檔成功、再刪舊檔(delete-after-write),避免「先刪舊→寫新失敗」使已核可/已送審文件平白遺失。
    const old = await prisma.evidence.findMany({
      where: { targetType, targetId: participant.id },
      select: { id: true, storageKey: true },
    });
    const saved = await saveBuffer(buf, `evidences/${targetType}/${participant.id}`, file.name); // 失敗即拋,舊檔原封不動

    let item;
    try {
      // 建新列 + 刪舊列同一交易(原子);舊「實體檔」待交易成功後才刪,確保任何失敗點舊檔都還在。
      item = await prisma.$transaction(async (tx) => {
        if (old.length) await tx.evidence.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
        return tx.evidence.create({
          data: {
            targetType,
            targetId: participant.id,
            fileName: saved.fileName,
            originalName: file.name,
            mimeType: realMime,
            sizeBytes: saved.sizeBytes,
            storageKey: saved.storageKey,
            sha256: saved.sha256,
            uploadedById: user.id,
          },
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
        });
      });
    } catch (e) {
      // DB 交易失敗 → 回收剛寫入的新實體檔(避免孤兒),舊檔與舊列原封不動。
      await deleteFileByKey(saved.storageKey).catch(() => {});
      throw e;
    }
    // 交易成功(新列已在、舊列已刪)→ 刪舊實體檔;失敗僅留孤兒檔(無資料遺失)。
    for (const o of old) await deleteFileByKey(o.storageKey).catch(() => {});

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_DOC_UPLOAD',
      entityType: 'SurveyParticipant',
      entityId: participant.id,
      after: { slot, evidenceId: item.id, byAdmin: isAdmin },
      ...extractRequestMeta(req),
    });

    // UAT 圖72:必備文件上傳齊全即自動送審——「上傳完還要另按送審」一直坑人
    // (實例:委員傳齊 CV+NDA 卻停在未繳交,中心與本人都以為已完成)。
    // 領據(RECEIPT)不在必備集,不觸發;退補(RETURNED)重傳補齊亦自動重新送審;
    // 補填一次性消耗(圖52)語意與 docs/submit 對稱。
    let autoSubmitted = false;
    if (slot !== 'RECEIPT' && participant.docStatus !== 'SUBMITTED') {
      const [cvCount, ndaCount] = await Promise.all([
        prisma.evidence.count({ where: { targetType: 'SURVEY_CV', targetId: participant.id } }),
        prisma.evidence.count({ where: { targetType: 'SURVEY_NDA', targetId: participant.id } }),
      ]);
      const complete = (participant.kind !== 'MEMBER' || cvCount > 0) && ndaCount > 0;
      if (complete) {
        const consumeUnlock = !isAdmin && participant.editUnlocked && participant.submittedAt !== null;
        await prisma.surveyParticipant.update({
          where: { id: participant.id },
          data: {
            docStatus: 'SUBMITTED',
            docSubmittedAt: new Date(),
            rejectReason: null,
            docReviewedAt: null,
            ...(consumeUnlock ? { editUnlocked: false } : {}),
          },
        });
        autoSubmitted = true;
        await writeAuditLog({
          actorId: user.id,
          action: 'SURVEY_DOC_SUBMIT',
          entityType: 'SurveyParticipant',
          entityId: participant.id,
          after: { auto: true, ...(consumeUnlock ? { editUnlockConsumed: true } : {}) },
          ...extractRequestMeta(req),
        });
      }
    }

    return NextResponse.json({ item, autoSubmitted });
  } catch (e) {
    return errorResponse(e);
  }
}
