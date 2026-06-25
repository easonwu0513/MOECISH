'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from '../icons';

/**
 * 主行動橫幅的 CTA 按鈕。
 * 修正「同頁錨點(如 #setup)點了沒反應」:當目標路徑就是當前頁、只差 hash 時,
 * Next <Link> 不會捲動 → 改用原生捲動到該錨點;跨頁則照常 <Link> 導航。
 */
export function PrimaryActionCta({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className: string;
}) {
  const pathname = usePathname();
  const hashIdx = href.indexOf('#');
  const path = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const hash = hashIdx >= 0 ? href.slice(hashIdx + 1) : '';
  const samePage = hash && (path === '' || path === pathname);

  if (samePage) {
    return (
      <a
        href={`#${hash}`}
        className={className}
        onClick={(e) => {
          const el = document.getElementById(hash);
          if (el) {
            e.preventDefault();
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }}
      >
        {label}
        <ChevronRight size={18} />
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {label}
      <ChevronRight size={18} />
    </Link>
  );
}
