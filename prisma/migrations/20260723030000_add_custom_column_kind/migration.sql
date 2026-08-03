-- UAT 圖58:自訂欄位歸屬類別(MEMBER|OBSERVER;NULL=兩類共用,既有欄位相容)
ALTER TABLE "SurveyCustomColumn" ADD COLUMN "kind" TEXT;
