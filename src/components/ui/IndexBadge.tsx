import { Check } from '../icons';
import { cn } from '@/lib/cn';

/**
 * 序號徽章單一來源(設計精緻化;批83)。
 * 收斂散落的「小方框/圓圈顯示序號」手刻樣式:PrepBoard 應備資料索引(方形,確認齊備→綠勾)、
 * 儀表板流程步驟(圓形,當前階段→實心主色)。統一尺寸/形狀/狀態語彙,序號一律 tabular-nums。
 *
 * state:default 中性、active 當前(實心主色)、done 完成(success 淺底 + 綠勾取代數字)。
 * 徽章為視覺輔助,語意由相鄰標題承載 → 預設 aria-hidden。
 */
export function IndexBadge({
  n,
  state = 'default',
  size = 'md',
  shape = 'square',
  className,
}: {
  /** 序號(done 狀態下改顯綠勾) */
  n: number;
  state?: 'default' | 'active' | 'done';
  size?: 'sm' | 'md';
  shape?: 'square' | 'circle';
  className?: string;
}) {
  const dim = size === 'sm' ? 'w-6 h-6 text-caption' : 'w-8 h-8 text-body-sm';
  const look =
    state === 'done'   ? 'bg-success-50 text-success-700' :
    state === 'active' ? 'bg-primary-600 text-white' :
    'bg-paper-sunk text-ink-500';
  return (
    <span
      aria-hidden
      className={cn(
        'flex items-center justify-center font-medium tabular-nums shrink-0',
        dim,
        shape === 'circle' ? 'rounded-full' : 'rounded-md',
        look,
        className,
      )}
    >
      {state === 'done' ? <Check size={size === 'sm' ? 14 : 16} /> : n}
    </span>
  );
}
