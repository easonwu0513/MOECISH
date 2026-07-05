import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type NoteTone = 'neutral' | 'primary' | 'success' | 'warning';

const NOTE: Record<NoteTone, { box: string; label: string }> = {
  neutral: { box: 'bg-surface-container border-outline-variant/60', label: 'text-on-surface-variant' },
  primary: { box: 'bg-primary-50/50 border-primary-100',           label: 'text-primary-800' },
  success: { box: 'bg-success-50 border-success-100',              label: 'text-success-800' },
  warning: { box: 'bg-warning-50 border-warning-100',              label: 'text-warning-800' },
};

/**
 * 審閱題卡的資訊盒單一來源(UIUX 稽核 #9)。原本每張題卡下方堆 5~7 個盒子
 * (機關說明／紀錄文件／機關補正回應／佐證檔案／委員意見…),每個各自硬編
 * bg／border／label 配方,顏色語意分散、一改就漂移,且全部同重量看起來很吵。
 * 收斂為單一 <NoteBox tone label>:tone→box/label 配方一處定義。
 *
 * 三層視覺層級(由呼叫端組合達成,非再加樣式旋鈕):
 *   層1 機關作答主體 —— 機關說明 prominent(surface-container-high + body 級字),作為題卡錨點
 *   層2 往返對話     —— 補正回應(primary)/委員意見(warning 待補・success 已補正)以 tone 承載
 *   層3 參考         —— 法規對照維持可收合 details,最低視覺重量(不走 NoteBox)
 */
export function NoteBox({
  tone = 'neutral',
  label,
  header,
  prominent,
  className,
  children,
}: {
  tone?: NoteTone;
  /** 區塊標題(caption 樣式);與 header 二擇一 */
  label?: ReactNode;
  /** 自訂表頭節點(如委員意見的作者/輪次列) */
  header?: ReactNode;
  /** 機關作答主體加重(層1 錨點):較亮表面 */
  prominent?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const t = NOTE[tone];
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        prominent ? 'bg-surface-container-high border-outline-variant/60' : t.box,
        className,
      )}
    >
      {header}
      {label && (
        <p className={cn('text-caption font-medium mb-1', prominent ? 'text-on-surface' : t.label)}>{label}</p>
      )}
      {children}
    </div>
  );
}
