'use client';

import { FilterPanel } from '@medicore/ui';
import { TopbarActionsContent, TopbarContent, useHasTopbarSlot } from './topbar-slot';

export function PageHeader({
  title,
  description,
  actions,
  filters,
  activeFilterCount,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Filter controls for the page. In the top bar from md up; behind a Filters button in the page body on phones. */
  filters?: React.ReactNode;
  activeFilterCount?: number;
}) {
  const inTopbar = useHasTopbarSlot();

  // In the app shell the title and actions live in the top bar, so the page body has no second header.
  if (inTopbar) {
    return (
      <>
        <TopbarContent>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">{title}</h1>
            {description && (
              <p className="hidden truncate text-xs text-muted-foreground md:block">{description}</p>
            )}
          </div>
        </TopbarContent>
        {(actions || filters) && (
          <TopbarActionsContent>
            {filters && <div className="hidden items-center gap-3 md:flex">{filters}</div>}
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {(actions || filters) && (
        <div className="flex flex-wrap items-center gap-2">
          {filters}
          {actions}
        </div>
      )}
    </div>
  );
}
