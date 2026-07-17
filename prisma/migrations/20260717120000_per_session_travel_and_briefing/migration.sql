-- AlterTable
ALTER TABLE "SurveySession" ADD COLUMN     "isBriefing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "needsTravel" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SurveyFinalAssignment" ADD COLUMN     "transport" TEXT;

