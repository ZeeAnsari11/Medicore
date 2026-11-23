'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@medicore/ui';

const TABS = [
  { href: '/accounting/expenses', label: 'Expenses' },
  { href: '/accounting/expenses/categories', label: 'Categories' },
];

/** Segmented switch between the expense list and the category manager. */
export function ExpenseNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Expense sections"
      className="mb-5 inline-flex rounded-lg border bg-muted/60 p-1"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
