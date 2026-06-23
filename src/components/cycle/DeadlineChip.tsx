import { Chip } from '@/components/ui/Chip';

/**
 * 矯正截止壓力 chip:僅在「矯正執行中且未全數通過」時顯示。
 * 逾期→danger、未到期→warning。天數以本地日界計(與追蹤信一致)。
 * 週期首頁、缺失頁、週期清單卡共用,訊號出現在實際填報處才有用。
 */
export function DeadlineChip({
  status,
  dueDate,
  allPassed,
  size = 'sm',
}: {
  status: string;
  dueDate: Date | string | null;
  allPassed: boolean;
  size?: 'sm' | 'md';
}) {
  if (status !== 'REMEDIATION' || allPassed || !dueDate) return null;
  const dueDay = new Date(dueDate);
  dueDay.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
  return days < 0
    ? <Chip tone="danger" size={size} dot>已逾期 {Math.abs(days)} 天</Chip>
    : <Chip tone="warning" size={size} dot>距截止剩 {days} 天</Chip>;
}
