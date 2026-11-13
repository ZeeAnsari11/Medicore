'use client';

import { TopbarActionsContent, TopbarContent, useHasTopbarSlot } from './topbar-slot';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
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
        {actions && <TopbarActionsContent>{actions}</TopbarActionsContent>}
      </>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
