'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FilterPanel } from '@medicore/ui';
import { TopbarActionsContent, TopbarContent, useHasTopbarSlot } from './topbar-slot';

export function PageHeader({
  title,
  description,
  actions,
  filters,
  activeFilterCount,
  back,
  report,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Filter controls for the page. In the top bar from md up; behind a Filters button in the page body on phones. */
  filters?: React.ReactNode;
  activeFilterCount?: number;
  /** Where an arrow before the title goes (the parent page); omit on top-level pages. */
  back?: { href: string; label: string };
  /** A Download Report button, placed before the page's own actions. */
  report?: React.ReactNode;
}) {
  const backLink = back && (
    <Link
      href={back.href}
      title={back.label}
      aria-label={back.label}
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ArrowLeft className="size-5" />
    </Link>
  );
  const inTopbar = useHasTopbarSlot();

  // In the app shell the title and actions live in the top bar, so the page body has no second header.
  if (inTopbar) {
    return (
      <>
        <TopbarContent>
          <div className="flex min-w-0 items-center gap-2">
            {backLink}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">{title}</h1>
              {description && (
                <p className="hidden truncate text-xs text-muted-foreground md:block">{description}</p>
              )}
            </div>
          </div>
        </TopbarContent>
        {(actions || filters || report) && (
          <TopbarActionsContent>
            {filters && <div className="hidden items-center gap-3 md:flex">{filters}</div>}
            {report}
            {actions}
          </TopbarActionsContent>
        )}
        {filters && (
          <div className="mb-4 flex flex-wrap items-center gap-2 md:hidden">
            <FilterPanel activeCount={activeFilterCount}>{filters}</FilterPanel>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-2">
        {backLink}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {(actions || filters || report) && (
        <div className="flex flex-wrap items-center gap-2">
          {filters}
          {report}
          {actions}
        </div>
      )}
    </div>
  );
}
