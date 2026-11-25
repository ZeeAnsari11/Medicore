'use client';

import * as React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';

interface FilterPanelProps {
  /** Number of filters currently applied; shown on the phone toggle. */
  activeCount?: number;
  className?: string;
  children: React.ReactNode;
}

/**
 * Keeps a page's filter controls behind a "Filters" button on phones and leaves them inline from `md` up.
 * Render it inside the flex row that holds the filters: at `md+` its wrapper is `display: contents`, so the
 * children sit in that row exactly as if the panel were not there. The children render once in both layouts.
 */
function FilterPanel({ activeCount = 0, className, children }: FilterPanelProps) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="md:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontal className="mr-2 h-4 w-4" />
        Filters
        {activeCount > 0 && (
          <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
            {activeCount}
          </span>
        )}
      </Button>
      <div
        id={panelId}
        className={cn(
          'basis-full grid-cols-2 gap-2 md:contents',
          // Phone layout: two columns, every control fills its cell.
          'max-md:[&>*]:!m-0 max-md:[&>*]:!w-full max-md:[&_label_input]:!w-auto max-md:[&_label_input]:flex-1',
          open ? 'grid' : 'hidden md:contents',
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}

export { FilterPanel, type FilterPanelProps };
