-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organizationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),
    "disabledById" TEXT,
    "disabledByName" TEXT,
    "disableReason" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordHistory" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "userId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "coverKey" TEXT,
    "important" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "unpublishAt" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostAttachment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,

    CONSTRAINT "PostAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditCycle" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "organizationId" TEXT NOT NULL,
    "checklistVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "prepDueDate" TIMESTAMP(3),
    "prepDueTech" TIMESTAMP(3),
    "techCheckDate" TIMESTAMP(3),
    "onsiteDate" TIMESTAMP(3),
    "reviewWindowStart" TIMESTAMP(3),
    "reviewWindowEnd" TIMESTAMP(3),
    "observerWindowStart" TIMESTAMP(3),
    "observerWindowEnd" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "checklistSubmittedAt" TIMESTAMP(3),
    "checklistSubmittedBy" TEXT,
    "checklistReopenNote" TEXT,
    "auditReportMeta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditScore" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "score" INTEGER,
    "cntComply" INTEGER,
    "cntPartial" INTEGER,
    "cntNonComply" INTEGER,
    "cntNa" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "aspect" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "checklistRef" TEXT,
    "deficiencyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingSnippet" (
    "id" TEXT NOT NULL,
    "aspect" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FindingSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditorAssignment" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "dimensions" TEXT,
    "reviewDoneAt" TIMESTAMP(3),
    "scoreLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleObserver" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "observerId" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "dimensions" TEXT,
    "practiceLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleObserver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeFinding" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "observerId" TEXT NOT NULL,
    "aspect" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "checklistRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeFeedback" (
    "id" TEXT NOT NULL,
    "practiceFindingId" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeScore" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "observerId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "score" INTEGER,
    "cntComply" INTEGER,
    "cntPartial" INTEGER,
    "cntNonComply" INTEGER,
    "cntNa" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeComment" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "observerId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleStateTransition" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleStateTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT NOT NULL DEFAULT 'ONSITE',
    "year" INTEGER,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "PrepTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepTemplateFile" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepTemplateFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepRequirement" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT NOT NULL DEFAULT 'ONSITE',
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "PrepRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepSubmission" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EMPTY',
    "note" TEXT,
    "noFileReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrepSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deficiency" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "aspect" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "itemNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "checklistRef" TEXT,
    "createdById" TEXT NOT NULL,
    "reviewerAuditorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deficiency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectiveAction" (
    "id" TEXT NOT NULL,
    "deficiencyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "round" INTEGER NOT NULL DEFAULT 1,
    "rootCause" TEXT,
    "measureStrategy" TEXT,
    "measureManagement" TEXT,
    "measureTechnical" TEXT,
    "plannedDate" TIMESTAMP(3),
    "trackingMethod" TEXT,
    "execStatus" TEXT,
    "actualDate" TIMESTAMP(3),
    "extendedDate" TIMESTAMP(3),
    "delayReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrectiveAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRecord" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "snapshot" TEXT,
    "auditorId" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignedReport" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "SignedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedDeficiency" (
    "id" TEXT NOT NULL,
    "deficiencyId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "originCycleId" TEXT NOT NULL,
    "aspect" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "itemNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "checklistRef" TEXT,
    "originYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRACKING',
    "cadenceMonths" INTEGER NOT NULL DEFAULT 6,
    "nextReportDue" TIMESTAMP(3) NOT NULL,
    "assignedAuditorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,

    CONSTRAINT "TrackedDeficiency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedReport" (
    "id" TEXT NOT NULL,
    "trackedId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "execStatus" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveySession" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "anonymizeForMember" BOOLEAN NOT NULL DEFAULT true,
    "anonymizeForObserver" BOOLEAN NOT NULL DEFAULT true,
    "sharedWithObserver" BOOLEAN NOT NULL DEFAULT true,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "targetMemberCount" INTEGER NOT NULL DEFAULT 0,
    "targetObserverCount" INTEGER NOT NULL DEFAULT 0,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyParticipant" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "committeeType" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "phone2" TEXT,
    "email2" TEXT,
    "note" TEXT,
    "replyStatus" TEXT NOT NULL DEFAULT 'NO',
    "docHandover" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "editUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "docStatus" TEXT NOT NULL DEFAULT 'NONE',
    "rejectReason" TEXT,
    "docSubmittedAt" TIMESTAMP(3),
    "docReviewedAt" TIMESTAMP(3),
    "transport" TEXT,
    "diet" TEXT,
    "travelNote" TEXT,
    "customValues" TEXT,
    "invitedById" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyTemplate" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "slot" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyCustomColumn" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "selfEditable" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyCustomColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyFillWindow" (
    "year" INTEGER NOT NULL,
    "openAt" TIMESTAMP(3),
    "closeAt" TIMESTAMP(3),
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyFillWindow_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "SessionAvailability" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyFinalAssignment" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyFinalAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistVersion" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChecklistVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "itemNo" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "auditBasis" TEXT,
    "auditFocus" TEXT,
    "expectedEvidence" TEXT,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistResponse" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "compliance" TEXT,
    "description" TEXT,
    "recordDocs" TEXT,
    "orgRevisionNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "lastEditorId" TEXT,
    "lastEditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditorComment" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditorComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterTemplate" (
    "id" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "workflowOrder" INTEGER NOT NULL DEFAULT 99,
    "subGroup" TEXT,
    "title" TEXT NOT NULL,
    "attachment" TEXT NOT NULL DEFAULT '無',
    "audience" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "context" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryAt" TIMESTAMP(3),
    "templateKey" TEXT,
    "relatedInvitationId" TEXT,
    "relatedCycleId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyTemplate" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyStage" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "JourneyStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyItem" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hint" TEXT,
    "role" TEXT,
    "autoKey" TEXT,
    "informational" BOOLEAN NOT NULL DEFAULT false,
    "href" TEXT,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "JourneyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyProgress" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "cycleId" TEXT,
    "programmeYear" INTEGER,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "doneByName" TEXT,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "chainHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserRole_userId_endedAt_idx" ON "UserRole"("userId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_idx" ON "Invitation"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE INDEX "Post_status_category_publishedAt_idx" ON "Post"("status", "category", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditCycle_organizationId_year_key" ON "AuditCycle"("organizationId", "year");

-- CreateIndex
CREATE INDEX "AuditScore_cycleId_idx" ON "AuditScore"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditScore_cycleId_auditorId_dimension_key" ON "AuditScore"("cycleId", "auditorId", "dimension");

-- CreateIndex
CREATE INDEX "AuditFinding_cycleId_aspect_kind_idx" ON "AuditFinding"("cycleId", "aspect", "kind");

-- CreateIndex
CREATE INDEX "FindingSnippet_aspect_kind_idx" ON "FindingSnippet"("aspect", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AuditorAssignment_cycleId_auditorId_key" ON "AuditorAssignment"("cycleId", "auditorId");

-- CreateIndex
CREATE INDEX "CycleObserver_cycleId_mentorId_idx" ON "CycleObserver"("cycleId", "mentorId");

-- CreateIndex
CREATE UNIQUE INDEX "CycleObserver_cycleId_observerId_key" ON "CycleObserver"("cycleId", "observerId");

-- CreateIndex
CREATE INDEX "PracticeFinding_cycleId_observerId_idx" ON "PracticeFinding"("cycleId", "observerId");

-- CreateIndex
CREATE INDEX "PracticeScore_cycleId_idx" ON "PracticeScore"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeScore_cycleId_observerId_dimension_key" ON "PracticeScore"("cycleId", "observerId", "dimension");

-- CreateIndex
CREATE INDEX "PracticeComment_responseId_idx" ON "PracticeComment"("responseId");

-- CreateIndex
CREATE INDEX "PracticeComment_observerId_idx" ON "PracticeComment"("observerId");

-- CreateIndex
CREATE INDEX "PrepTemplateFile_itemId_idx" ON "PrepTemplateFile"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PrepSubmission_requirementId_key" ON "PrepSubmission"("requirementId");

-- CreateIndex
CREATE INDEX "Deficiency_cycleId_aspect_idx" ON "Deficiency"("cycleId", "aspect");

-- CreateIndex
CREATE UNIQUE INDEX "Deficiency_cycleId_aspect_type_itemNo_key" ON "Deficiency"("cycleId", "aspect", "type", "itemNo");

-- CreateIndex
CREATE UNIQUE INDEX "CorrectiveAction_deficiencyId_key" ON "CorrectiveAction"("deficiencyId");

-- CreateIndex
CREATE INDEX "ReviewRecord_actionId_round_idx" ON "ReviewRecord"("actionId", "round");

-- CreateIndex
CREATE INDEX "SignedReport_cycleId_idx" ON "SignedReport"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedDeficiency_deficiencyId_key" ON "TrackedDeficiency"("deficiencyId");

-- CreateIndex
CREATE INDEX "TrackedDeficiency_organizationId_status_idx" ON "TrackedDeficiency"("organizationId", "status");

-- CreateIndex
CREATE INDEX "TrackedDeficiency_assignedAuditorId_status_idx" ON "TrackedDeficiency"("assignedAuditorId", "status");

-- CreateIndex
CREATE INDEX "TrackedReport_trackedId_idx" ON "TrackedReport"("trackedId");

-- CreateIndex
CREATE INDEX "SurveySession_year_orderIndex_idx" ON "SurveySession"("year", "orderIndex");

-- CreateIndex
CREATE INDEX "SurveyParticipant_year_kind_idx" ON "SurveyParticipant"("year", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyParticipant_year_userId_kind_key" ON "SurveyParticipant"("year", "userId", "kind");

-- CreateIndex
CREATE INDEX "SurveyTemplate_year_idx" ON "SurveyTemplate"("year");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyTemplate_year_slot_key" ON "SurveyTemplate"("year", "slot");

-- CreateIndex
CREATE INDEX "SurveyCustomColumn_year_orderIndex_idx" ON "SurveyCustomColumn"("year", "orderIndex");

-- CreateIndex
CREATE INDEX "SessionAvailability_sessionId_idx" ON "SessionAvailability"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionAvailability_participantId_sessionId_key" ON "SessionAvailability"("participantId", "sessionId");

-- CreateIndex
CREATE INDEX "SurveyFinalAssignment_participantId_idx" ON "SurveyFinalAssignment"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyFinalAssignment_participantId_sessionId_key" ON "SurveyFinalAssignment"("participantId", "sessionId");

-- CreateIndex
CREATE INDEX "ChecklistVersion_year_idx" ON "ChecklistVersion"("year");

-- CreateIndex
CREATE INDEX "ChecklistItem_versionId_dimension_idx" ON "ChecklistItem"("versionId", "dimension");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItem_versionId_itemNo_key" ON "ChecklistItem"("versionId", "itemNo");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistResponse_cycleId_checklistItemId_key" ON "ChecklistResponse"("cycleId", "checklistItemId");

-- CreateIndex
CREATE INDEX "AuditorComment_responseId_round_idx" ON "AuditorComment"("responseId", "round");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "LetterTemplate_templateKey_key" ON "LetterTemplate"("templateKey");

-- CreateIndex
CREATE INDEX "LetterTemplate_workflowOrder_idx" ON "LetterTemplate"("workflowOrder");

-- CreateIndex
CREATE INDEX "EmailLog_sentAt_idx" ON "EmailLog"("sentAt");

-- CreateIndex
CREATE INDEX "EmailLog_toEmail_idx" ON "EmailLog"("toEmail");

-- CreateIndex
CREATE INDEX "EmailLog_kind_idx" ON "EmailLog"("kind");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyTemplate_scope_key" ON "JourneyTemplate"("scope");

-- CreateIndex
CREATE INDEX "JourneyStage_templateId_idx" ON "JourneyStage"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyStage_templateId_stageKey_key" ON "JourneyStage"("templateId", "stageKey");

-- CreateIndex
CREATE INDEX "JourneyItem_stageId_idx" ON "JourneyItem"("stageId");

-- CreateIndex
CREATE INDEX "JourneyProgress_cycleId_idx" ON "JourneyProgress"("cycleId");

-- CreateIndex
CREATE INDEX "JourneyProgress_programmeYear_idx" ON "JourneyProgress"("programmeYear");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyProgress_itemId_cycleId_key" ON "JourneyProgress"("itemId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyProgress_itemId_programmeYear_key" ON "JourneyProgress"("itemId", "programmeYear");

-- CreateIndex
CREATE INDEX "Evidence_targetType_targetId_idx" ON "Evidence"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAttachment" ADD CONSTRAINT "PostAttachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCycle" ADD CONSTRAINT "AuditCycle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCycle" ADD CONSTRAINT "AuditCycle_checklistVersionId_fkey" FOREIGN KEY ("checklistVersionId") REFERENCES "ChecklistVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditScore" ADD CONSTRAINT "AuditScore_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditScore" ADD CONSTRAINT "AuditScore_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorAssignment" ADD CONSTRAINT "AuditorAssignment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorAssignment" ADD CONSTRAINT "AuditorAssignment_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleObserver" ADD CONSTRAINT "CycleObserver_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleObserver" ADD CONSTRAINT "CycleObserver_observerId_fkey" FOREIGN KEY ("observerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleObserver" ADD CONSTRAINT "CycleObserver_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeFinding" ADD CONSTRAINT "PracticeFinding_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeFinding" ADD CONSTRAINT "PracticeFinding_observerId_fkey" FOREIGN KEY ("observerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeFeedback" ADD CONSTRAINT "PracticeFeedback_practiceFindingId_fkey" FOREIGN KEY ("practiceFindingId") REFERENCES "PracticeFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeFeedback" ADD CONSTRAINT "PracticeFeedback_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeScore" ADD CONSTRAINT "PracticeScore_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeScore" ADD CONSTRAINT "PracticeScore_observerId_fkey" FOREIGN KEY ("observerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeComment" ADD CONSTRAINT "PracticeComment_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "ChecklistResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeComment" ADD CONSTRAINT "PracticeComment_observerId_fkey" FOREIGN KEY ("observerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleStateTransition" ADD CONSTRAINT "CycleStateTransition_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleStateTransition" ADD CONSTRAINT "CycleStateTransition_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepTemplateItem" ADD CONSTRAINT "PrepTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PrepTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepTemplateFile" ADD CONSTRAINT "PrepTemplateFile_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PrepTemplateItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepRequirement" ADD CONSTRAINT "PrepRequirement_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepSubmission" ADD CONSTRAINT "PrepSubmission_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "PrepRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deficiency" ADD CONSTRAINT "Deficiency_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deficiency" ADD CONSTRAINT "Deficiency_reviewerAuditorId_fkey" FOREIGN KEY ("reviewerAuditorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_deficiencyId_fkey" FOREIGN KEY ("deficiencyId") REFERENCES "Deficiency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRecord" ADD CONSTRAINT "ReviewRecord_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "CorrectiveAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedReport" ADD CONSTRAINT "SignedReport_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedDeficiency" ADD CONSTRAINT "TrackedDeficiency_deficiencyId_fkey" FOREIGN KEY ("deficiencyId") REFERENCES "Deficiency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedDeficiency" ADD CONSTRAINT "TrackedDeficiency_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedDeficiency" ADD CONSTRAINT "TrackedDeficiency_originCycleId_fkey" FOREIGN KEY ("originCycleId") REFERENCES "AuditCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedDeficiency" ADD CONSTRAINT "TrackedDeficiency_assignedAuditorId_fkey" FOREIGN KEY ("assignedAuditorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedReport" ADD CONSTRAINT "TrackedReport_trackedId_fkey" FOREIGN KEY ("trackedId") REFERENCES "TrackedDeficiency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyParticipant" ADD CONSTRAINT "SurveyParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAvailability" ADD CONSTRAINT "SessionAvailability_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SurveyParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAvailability" ADD CONSTRAINT "SessionAvailability_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SurveySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyFinalAssignment" ADD CONSTRAINT "SurveyFinalAssignment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SurveyParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyFinalAssignment" ADD CONSTRAINT "SurveyFinalAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SurveySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ChecklistVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistResponse" ADD CONSTRAINT "ChecklistResponse_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistResponse" ADD CONSTRAINT "ChecklistResponse_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorComment" ADD CONSTRAINT "AuditorComment_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "ChecklistResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyStage" ADD CONSTRAINT "JourneyStage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JourneyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyItem" ADD CONSTRAINT "JourneyItem_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "JourneyStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyProgress" ADD CONSTRAINT "JourneyProgress_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "JourneyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyProgress" ADD CONSTRAINT "JourneyProgress_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

