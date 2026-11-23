'use client';

import { useMemo, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from '@medicore/ui';

export interface MultiOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  label: string;
  options: MultiOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Trigger text when nothing is ticked; defaults to `All <label>s`. */
  allLabel?: string;
  /** Adds a "Select all" row that ticks (or clears) everything currently listed, i.e. matching the search. */
  selectAll?: boolean;
  /** Adds a "+ Create ..." button that closes the list and hands over to the caller's own create dialog. */
  onCreateNew?: () => void;
  createLabel?: string;
  /** For lists that start fully ticked: the trigger reads `allLabel` while everything is ticked, and there is no Clear button. */
  allWhenFull?: boolean;
}

export function MultiSelect({ label, options, value, onChange, allLabel, selectAll, onCreateNew, createLabel, allWhenFull }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, search]);

  const allShown = shown.length > 0 && shown.every((o) => value.includes(o.value));
  const toggleAll = () =>
    onChange(allShown ? value.filter((v) => !shown.some((o) => o.value === v)) : [...value, ...shown.map((o) => o.value).filter((v) => !value.includes(v))]);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  const everyLabel = allLabel ?? `All ${label.toLowerCase()}s`;
  const triggerText =
    allWhenFull && options.length > 0 && value.length === options.length
      ? everyLabel
      : value.length
        ? `${label} (${value.length})`
        : allWhenFull
          ? 'None selected'
          : everyLabel;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-48 justify-between font-normal">
          <span className="truncate">{triggerText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          className="mb-2 h-8"
          placeholder={`Search ${label.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {onCreateNew && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-1 w-full justify-start text-primary"
            onClick={() => {
              setOpen(false);
              onCreateNew();
            }}
          >
            + {createLabel ?? `Create ${label.toLowerCase()}`}
          </Button>
        )}
        <div className="max-h-64 overflow-auto">
          {shown.length === 0 && <div className="p-2 text-sm text-muted-foreground">Nothing found</div>}
          {selectAll && shown.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 rounded border-b px-2 py-1.5 text-sm font-medium hover:bg-accent">
              <input type="checkbox" checked={allShown} onChange={toggleAll} />
              <span>Select all</span>
            </label>
          )}
          {shown.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
        {value.length > 0 && !allWhenFull && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => onChange([])}>
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
