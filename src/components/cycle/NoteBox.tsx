import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type NoteTone = 'neutral' | 'primary' | 'success' | 'warning';

const NOTE: Record<NoteTone, { box: string; label: string }> = {
  neutral: { box: 'bg-paper-sunk border-rule', label: 'text-ink-500' },
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
 *   層1 機關作答主體 —— 機關說明 prominent(rule-strong 框線 + body 級字/ink-900),作為題卡錨點
 *   層2 往返對話     —— 補正回應(primary)/委員意見(warning 待補・success 已補正)以 tone 承載
 *   層3 參考         —— 法規對照維持可收合 details,最低視覺重量(不走 NoteBox)
 */
export function NoteBox({
  tone = 'neutral',
  label,
  action,
  header,
  prominent,
  className,
  children,
}: {
  tone?: NoteTone;
  /** 區塊標題(caption 樣式);與 header 二擇一 */
  label?: ReactNode;
  /** 標題列右側動作(如委員審閱題卡的「稽核重點/應備文件」就地展開鈕);與 label 同列右對齊 */
  action?: ReactNode;
  /** 自訂表頭節點(如委員意見的作者/輪次列) */
  header?: ReactNode;
  /** 機關作答主體加重(層1 錨點):強一階框線 + body 級字/ink-900 */
  prominent?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const t = NOTE[tone];
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        // prominent 用強一階框線承載層1 錨點(calm 遷移後表面統一 paper-sunk,與 neutral 同底色曾使加重失效)
        prominent ? 'bg-paper-sunk border-rule-strong' : t.box,
        className,
      )}
    >
      {header}
      {(label || action) && (
        <div className="mb-1 flex items-start justify-between gap-2">
          {label ? (
            <p className={cn('text-caption font-medium', prominent ? 'text-ink-900' : t.label)}>{label}</p>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
