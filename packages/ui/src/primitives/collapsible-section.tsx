'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';

interface CollapsibleSectionProps {
  /** One line shown on phones while the section is collapsed, e.g. the current choices. */
  summary: React.ReactNode;
  /** Keeps the section open and hides the toggle, e.g. while a required field is still empty. */
  forceOpen?: boolean;
  defaultOpen?: boolean;
  /** The bordered box around the toggle and the content. */
  className?: string;
  /** Layout of the content itself (grid, flex...). */
  contentClassName?: string;
  children: React.ReactNode;
}

/**
 * Below `sm` the content folds away behind a one-line summary with an Edit toggle; from `sm` up the content is
 * always shown and the toggle does not render. The children render once in both layouts.
 */
function CollapsibleSection({
  summary,
  forceOpen,
  defaultOpen = false,
  className,
  contentClassName,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const contentId = React.useId();
  const isOpen = forceOpen || open;

  return (
    <div className={className}>
      {!forceOpen && (
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left text-sm sm:hidden"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="min-w-0 flex-1 truncate">{summary}</span>
          <span className="shrink-0 text-xs font-medium text-primary">{isOpen ? 'Done' : 'Edit'}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
        </button>
      )}
      <div id={contentId} className={cn(!isOpen && 'max-sm:hidden', !forceOpen && isOpen && 'max-sm:mt-3', contentClassName)}>
        {children}
      </div>
    </div>
  );
}

export { CollapsibleSection, type CollapsibleSectionProps };
