-- UAT 圖49:觀察員可由事前場次調查連動先加入週期配對,指導委員後設 → mentorId 改可空
ALTER TABLE "CycleObserver" ALTER COLUMN "mentorId" DROP NOT NULL;
