import * as React from 'react';
import { cn } from '../lib/cn';

/** Pulsing placeholder block for content that is still loading; size it with className. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export { Skeleton };
