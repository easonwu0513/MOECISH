import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * 資料表原語 — 收斂全站手刻表格的重複樣式(thead 排版、列分隔線、hover、數字欄對齊)。
 * 預設值刻意重現既有手刻表格的 class,遷移時視覺零變化;後續 sticky/排序/zebra 在此擴充。
 *
 * 用法:
 *   <Table>
 *     <THead><Th>姓名</Th><Th numeric>數量</Th></THead>
 *     <tbody>
 *       <Tr><Td>王</Td><Td numeric>3</Td></Tr>
 *     </tbody>
 *   </Table>
 */
export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full text-body-sm', className)} {...rest} />;
}

/** thead + 內建一列 tr;Th 直接放 children 即可 */
export function THead({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <thead className={cn('text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low', className)}>
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ numeric, className, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  // 無障礙:預設 scope="col"(欄標頭),呼叫端可覆寫為 row
  return <th scope="col" className={cn('px-5 py-3 font-medium', numeric ? 'text-right' : 'text-left', className)} {...rest} />;
}

export function Tr({ hover = true, className, ...rest }: HTMLAttributes<HTMLTableRowElement> & { hover?: boolean }) {
  return (
    <tr
      className={cn(
        'border-t border-outline-variant/60',
        hover && 'hover:bg-surface-container-low transition-colors',
        className,
      )}
      {...rest}
    />
  );
}

export function Td({ numeric, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn('px-5 py-3', numeric && 'text-right tabular-nums whitespace-nowrap', className)} {...rest} />;
}
