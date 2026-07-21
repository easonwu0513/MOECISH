-- AlterTable
ALTER TABLE "SurveyFillWindow" ADD COLUMN     "observerCloseAt" TIMESTAMP(3),
ADD COLUMN     "observerOpenAt" TIMESTAMP(3),
ADD COLUMN     "observerTravelCloseAt" TIMESTAMP(3),
ADD COLUMN     "observerTravelOpenAt" TIMESTAMP(3);

-- 圖41 回填:觀察員時窗初始值=現行委員時窗(部署當下行為不變;中心之後可分開改)
UPDATE "SurveyFillWindow"
SET "observerOpenAt" = "openAt",
    "observerCloseAt" = "closeAt",
    "observerTravelOpenAt" = "travelOpenAt",
    "observerTravelCloseAt" = "travelCloseAt";

