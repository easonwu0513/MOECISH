import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes, ReactNode } from 'react';
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

/**
 * thead + 內建一列 tr;Th 直接放 children 即可。
 * sticky(UIUX 稽核 #12):thead 於容器內直向黏頂(需外層 <TableScroll maxHeight>);
 * th 各自帶底色與 z-20,避免捲動時被 tbody 內容透出。
 */
export function THead({ sticky, className, children }: { sticky?: boolean; className?: string; children: ReactNode }) {
  return (
    <thead
      className={cn(
        'text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low',
        sticky && '[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-surface-container-low',
        className,
      )}
    >
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ numeric, stickyCol, className, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; stickyCol?: boolean }) {
  // 無障礙:預設 scope="col"(欄標頭),呼叫端可覆寫為 row
  // stickyCol:首欄凍結;若同時位於 sticky thead(左上角格),需 z-30 蓋過直向黏頂的 z-20
  return (
    <th
      scope="col"
      className={cn(
        'px-5 py-3 font-medium',
        numeric ? 'text-right' : 'text-left',
        stickyCol && 'sticky left-0 z-30 bg-surface-container-low',
        className,
      )}
      {...rest}
    />
  );
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

export function Td({ numeric, stickyCol, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; stickyCol?: boolean }) {
  // stickyCol:首欄凍結;需實心底色(surface-container-lowest)遮住橫向捲動時滑過的其餘欄
  return (
    <td
      className={cn(
        'px-5 py-3',
        numeric && 'text-right tabular-nums whitespace-nowrap',
        stickyCol && 'sticky left-0 z-10 bg-surface-container-lowest',
        className,
      )}
      {...rest}
    />
  );
}

/**
 * 截斷誠實提示(UIUX 稽核 #12):單行截斷的文字一律附 title,讓被 … 藏起的全文可由 hover 得知,
 * 不會讓使用者誤以為那就是完整值。text 為純字串時自動當 title;可用 title 覆寫。
 */
export function Truncate({
  children,
  title,
  className,
}: {
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  const auto = typeof children === 'string' ? children : undefined;
  return (
    <span className={cn('block truncate', className)} title={title ?? auto}>
      {children}
    </span>
  );
}
