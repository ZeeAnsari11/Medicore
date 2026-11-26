'use client';

import { toAfterFrom } from '@/lib/date-range';
import { Button, FilterPanel, Input } from '@medicore/ui';
import { BranchFilter } from '@/components/branch-filter';
import type { BranchFilterState } from '@/hooks/use-branch-filter';

function iso(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

interface Preset {
  key: string;
  label: string;
  range: () => { from: string; to: string };
}

const PRESETS: Preset[] = [
  { key: 'today', label: 'Today', range: () => ({ from: iso(new Date()), to: iso(new Date()) }) },
  {
    key: 'month',
    label: 'This month',
    range: () => {
      const n = new Date();
      return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: iso(new Date(n.getFullYear(), n.getMonth() + 1, 0)) };
    },
  },
  {
    key: 'lastMonth',
    label: 'Last month',
    range: () => {
      const n = new Date();
      return { from: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: iso(new Date(n.getFullYear(), n.getMonth(), 0)) };
    },
  },
  {
    key: 'year',
    label: 'This year',
    range: () => {
      const n = new Date();
      return { from: iso(new Date(n.getFullYear(), 0, 1)), to: iso(new Date(n.getFullYear(), 11, 31)) };
    },
  },
];

/** Default period for a ledger opened without a range. */
export const defaultRange = () => PRESETS[1].range();

interface LedgerFiltersProps {
  from: string;
  to: string;
  branchFilter: BranchFilterState;
  onChange: (patch: { from?: string; to?: string }) => void;
}

export function LedgerFilters({ from, to, branchFilter, onChange }: LedgerFiltersProps) {
  const activePreset = PRESETS.find((p) => {
    const r = p.range();
    return r.from === from && r.to === to;
  })?.key;

  const def = defaultRange();
  const isDefault = from === def.from && to === def.to;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <FilterPanel activeCount={isDefault ? 0 : 1}>
        <div className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-1" role="group" aria-label="Period">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={activePreset === p.key ? 'default' : 'outline'}
              onClick={() => onChange(p.range())}
            >
              {p.label}
            </Button>
          ))}
          {!activePreset && <span className="px-2 text-sm font-medium text-muted-foreground">Custom range</span>}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          From
          <Input type="date" value={from} max={to || undefined} onChange={(e) => onChange({ from: e.target.value, to: toAfterFrom(e.target.value, to) })} className="w-40" />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          To
          <Input type="date" value={to} min={from || undefined} onChange={(e) => onChange({ to: e.target.value })} className="w-40" />
        </label>
        <BranchFilter filter={branchFilter} />
        <Button
          disabled={!(!isDefault)} variant="outline" size="sm" onClick={() => onChange(def)}>
          Clear filters
        </Button>
      </FilterPanel>
    </div>
  );
}
