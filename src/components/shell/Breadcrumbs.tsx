'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import { ChevronRight } from '../icons';

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="breadcrumb" className="flex items-center text-body-sm text-ink-500 min-w-0">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={i}>
            {c.href && !last ? (
              <Link href={c.href} className="hover:text-ink-900 truncate focus-ring rounded px-1 -mx-1 transition-colors">
                {c.label}
              </Link>
            ) : (
              <span className={last ? 'text-ink-900 font-medium truncate' : 'truncate'}>{c.label}</span>
            )}
            {!last && <ChevronRight size={14} className="mx-1.5 shrink-0 text-rule" />}
          </Fragment>
        );
      })}
    </nav>
  );
}
