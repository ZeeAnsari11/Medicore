import * as React from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '../lib/cn';

/** A place (e.g. a customer's territory) as a pin chip, so it reads as its own thing beside a name. */
export function PlaceChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary',
        className,
      )}
    >
      <MapPin className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}
