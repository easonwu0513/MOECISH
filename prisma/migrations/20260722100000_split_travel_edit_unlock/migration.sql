-- UAT 圖55:二階(差旅/飲食)補填開放獨立成欄,與一階 editUnlocked 分離
ALTER TABLE "SurveyParticipant" ADD COLUMN "travelEditUnlocked" BOOLEAN NOT NULL DEFAULT false;
