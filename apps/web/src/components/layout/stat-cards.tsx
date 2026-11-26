import Link from 'next/link';
import { toAfterFrom } from '@/lib/date-range';
import { Button, Input, cn } from '@medicore/ui';

export interface StatCardItem {
  title: string;
  value: number | string;
  /** Shown as a plain count ("12") instead of money ("12.00"). */
  count?: boolean;
  /** Small line under the value. */
  hint?: string;
  /** Makes the whole box a link. */
  href?: string;
}

/** One small total: uppercase label over the value. */
export function StatBox({ item }: { item: StatCardItem }) {
  return (
    <div className={cn('relative rounded-md border bg-card px-4 py-4', item.href && 'transition-colors hover:bg-muted/40')}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {item.href ? (
          <Link href={item.href} className="after:absolute after:inset-0">
            {item.title}
          </Link>
        ) : (
          item.title
        )}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{typeof item.value === 'number' && !item.count ? item.value.toFixed(2) : item.value}</p>
      {item.hint && <p className="text-xs text-muted-foreground">{item.hint}</p>}
    </div>
  );
}

/** The overview row at the top of a list page: a few small totals for what the page shows. */
export function StatCards({ items, note, className }: { items: StatCardItem[]; note?: string; className?: string }) {
  return (
    <div className={cn('mb-4 space-y-1', className)}>
      {/* One column per box (up to 6) from lg up, so a short row fills the width instead of leaving a gap. */}
      <div
        className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:[grid-template-columns:repeat(var(--stat-cols),minmax(0,1fr))]"
        style={{ '--stat-cols': Math.min(items.length, 6) } as React.CSSProperties}
      >
        {items.map((s) => (
          <StatBox key={s.title} item={s} />
        ))}
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** From / To day filter for the overview and the list under it. Values are yyyy-mm-dd; empty means open-ended. */
export function DateRangeFilter({
  from,
  to,
  onChange,
  inline,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  /** Sits inside another filter row instead of forming its own. */
  inline?: boolean;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', !inline && 'mb-4')}>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        From
        <Input type="date" value={from} max={to || undefined} onChange={(e) => onChange({ from: e.target.value, to: toAfterFrom(e.target.value, to) })} className="w-40" />
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        To
        <Input type="date" value={to} min={from || undefined} onChange={(e) => onChange({ from, to: e.target.value })} className="w-40" />
      </label>
      <Button variant="outline" size="sm" disabled={!from && !to} onClick={() => onChange({ from: '', to: '' })}>
        Clear dates
      </Button>
    </div>
  );
}

/** Whether an ISO date falls inside the inclusive yyyy-mm-dd range (local days). */
export function inDateRange(iso: string, from: string, to: string): boolean {
  const day = new Date(iso).toLocaleDateString('en-CA');
  return (!from || day >= from) && (!to || day <= to);
}
