/**
 * UAT 測試資料總清理腳本(危險!先備份 pg_dump + uploads 再跑)。
 * 「所有測試資料清掉、帳號留著」:業務流程資料全刪,帳號/機關/系統設定毫髮無傷。
 *
 *   npx tsx src/scripts/reset-uat-data.ts            # 乾跑:只列出將刪除/保留的數量,不動資料
 *   npx tsx src/scripts/reset-uat-data.ts --confirm  # 實際執行刪除(交易內,帳號不變式驗證失敗即回滾)
 *
 * 刪除:稽核週期(AuditCycle 級聯:檢核回應/委員意見/評分/發現/缺失/矯正/審查/狀態轉換/
 *       資料準備需求+繳交/委員指派/用印報告/精靈進度/觀察員配對/練習四表)、
 *       持續列管(TrackedReport/TrackedDeficiency;originCycleId 為 Restrict 故先刪)、
 *       事前場次調查(意願/最終指派/受調者/場次/時窗/自訂欄位)、
 *       公告(Post 級聯 PostAttachment)、通知、Email 紀錄、密碼重設 token、
 *       稽核軌跡(AuditLog;使用者確認清空)、
 *       佐證 Evidence(排除 SURVEY_TEMPLATE 公版範本檔)+ 對應 uploads 實體檔(含公告附件檔)。
 * 保留:User/UserRole/Organization/Invitation、檢核表題庫(ChecklistVersion/Item)、
 *       資料準備標準清單(PrepTemplate/Item/File)、精靈範本(JourneyTemplate/Stage/Item)、
 *       信件範本(LetterTemplate)、缺失片語(FindingSnippet)、
 *       事前調查公版範本(SurveyTemplate + 其 SURVEY_TEMPLATE Evidence 與實體檔)。
 */
import { prisma } from '../lib/db';
import { deleteFileByKey } from '../lib/storage';

const KEEP_EVIDENCE_TYPES = ['SURVEY_TEMPLATE'];

async function main() {
  const confirm = process.argv.includes('--confirm');

  // ── 盤點 ──
  const del = {
    trackedReports: await prisma.trackedReport.count(),
    trackedDeficiencies: await prisma.trackedDeficiency.count(),
    cycles: await prisma.auditCycle.count(),
    responses: await prisma.checklistResponse.count(),
    deficiencies: await prisma.deficiency.count(),
    surveySessions: await prisma.surveySession.count(),
    surveyParticipants: await prisma.surveyParticipant.count(),
    posts: await prisma.post.count(),
    notifications: await prisma.notification.count(),
    emailLogs: await prisma.emailLog.count(),
    auditLogs: await prisma.auditLog.count(),
    evidences: await prisma.evidence.count({ where: { targetType: { notIn: KEEP_EVIDENCE_TYPES } } }),
  };
  const keep = {
    users: await prisma.user.count(),
    userRoles: await prisma.userRole.count(),
    orgs: await prisma.organization.count(),
    invitations: await prisma.invitation.count(),
    checklistVersions: await prisma.checklistVersion.count(),
    letterTemplates: await prisma.letterTemplate.count(),
    surveyTemplates: await prisma.surveyTemplate.count(),
    templateEvidences: await prisma.evidence.count({ where: { targetType: { in: KEEP_EVIDENCE_TYPES } } }),
  };

  console.log('[reset-uat] 將刪除:');
  console.log(`  稽核週期 ${del.cycles}(檢核回應 ${del.responses}、缺失 ${del.deficiencies} 等隨級聯)`);
  console.log(`  持續列管 ${del.trackedDeficiencies}(回報 ${del.trackedReports})`);
  console.log(`  事前調查場次 ${del.surveySessions}、受調者 ${del.surveyParticipants}`);
  console.log(`  公告 ${del.posts}、通知 ${del.notifications}、Email 紀錄 ${del.emailLogs}、稽核軌跡 ${del.auditLogs}`);
  console.log(`  佐證 ${del.evidences}(保留公版範本檔 ${keep.templateEvidences})`);
  console.log('[reset-uat] 將保留:');
  console.log(`  帳號 ${keep.users}(身分授權 ${keep.userRoles})、機關 ${keep.orgs}、邀請 ${keep.invitations}`);
  console.log(`  題庫版本 ${keep.checklistVersions}、信件範本 ${keep.letterTemplates}、調查公版範本 ${keep.surveyTemplates}`);

  if (!confirm) {
    console.log('\n[reset-uat] 乾跑結束(未動任何資料)。確認無誤請加 --confirm 執行。');
    return;
  }

  // ── 先收集要刪的實體檔 key(交易成功後才刪檔) ──
  const evidenceKeys = (
    await prisma.evidence.findMany({
      where: { targetType: { notIn: KEEP_EVIDENCE_TYPES } },
      select: { storageKey: true },
    })
  ).map((e) => e.storageKey);
  const postKeys = (await prisma.postAttachment.findMany({ select: { storageKey: true } })).map(
    (a) => a.storageKey,
  );

  // ── 交易內刪除(FK 順序:列管先於週期;帳號不變式驗證失敗即整體回滾) ──
  await prisma.$transaction(
    async (tx) => {
      await tx.trackedReport.deleteMany({});
      await tx.trackedDeficiency.deleteMany({});
      // 練習/觀察員配對顯式先刪(不倚賴級聯設定)
      await tx.practiceFeedback.deleteMany({});
      await tx.practiceComment.deleteMany({});
      await tx.practiceScore.deleteMany({});
      await tx.practiceFinding.deleteMany({});
      await tx.cycleObserver.deleteMany({});
      await tx.evidence.deleteMany({ where: { targetType: { notIn: KEEP_EVIDENCE_TYPES } } });
      await tx.auditCycle.deleteMany({});
      await tx.sessionAvailability.deleteMany({});
      await tx.surveyFinalAssignment.deleteMany({});
      await tx.surveyParticipant.deleteMany({});
      await tx.surveySession.deleteMany({});
      await tx.surveyFillWindow.deleteMany({});
      await tx.surveyCustomColumn.deleteMany({});
      await tx.post.deleteMany({});
      await tx.notification.deleteMany({});
      await tx.feedbackReport.deleteMany({});
      await tx.emailLog.deleteMany({});
      await tx.passwordResetToken.deleteMany({});
      await tx.auditLog.deleteMany({});

      // 不變式:帳號/身分/機關/題庫/範本一筆都不能少
      const after = {
        users: await tx.user.count(),
        userRoles: await tx.userRole.count(),
        orgs: await tx.organization.count(),
        checklistVersions: await tx.checklistVersion.count(),
        letterTemplates: await tx.letterTemplate.count(),
        surveyTemplates: await tx.surveyTemplate.count(),
      };
      if (
        after.users !== keep.users ||
        after.userRoles !== keep.userRoles ||
        after.orgs !== keep.orgs ||
        after.checklistVersions !== keep.checklistVersions ||
        after.letterTemplates !== keep.letterTemplates ||
        after.surveyTemplates !== keep.surveyTemplates
      ) {
        throw new Error(
          `不變式失敗,整體回滾:${JSON.stringify({ before: keep, after })}`,
        );
      }
    },
    { timeout: 120000 },
  );
  console.log('[reset-uat] 資料庫清理完成(帳號/機關/設定不變式驗證通過)。');

  // ── 刪實體檔(逐檔;失敗僅警告) ──
  let removed = 0;
  let failed = 0;
  for (const key of [...evidenceKeys, ...postKeys]) {
    try {
      await deleteFileByKey(key);
      removed++;
    } catch {
      failed++;
    }
  }
  console.log(`[reset-uat] 實體檔:刪除 ${removed},失敗/不存在 ${failed}(公版範本檔未動)。`);

  // ── 終驗 ──
  const finals = {
    cycles: await prisma.auditCycle.count(),
    tracked: await prisma.trackedDeficiency.count(),
    sessions: await prisma.surveySession.count(),
    posts: await prisma.post.count(),
    notifications: await prisma.notification.count(),
    emailLogs: await prisma.emailLog.count(),
    auditLogs: await prisma.auditLog.count(),
    evidences: await prisma.evidence.count(),
    users: await prisma.user.count(),
  };
  console.log(`[reset-uat] 終驗:${JSON.stringify(finals)}`);
  console.log('[reset-uat] 完成。');
}

main()
  .catch((e) => {
    console.error('[reset-uat] 失敗:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
