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
}

export function MultiSelect({ label, options, value, onChange }: MultiSelectProps) {
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, search]);

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-48 justify-between font-normal">
          <span className="truncate">{value.length ? `${label} (${value.length})` : `All ${label.toLowerCase()}s`}</span>
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
        <div className="max-h-64 overflow-auto">
          {shown.length === 0 && <div className="p-2 text-sm text-muted-foreground">Nothing found</div>}
          {shown.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
        {value.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => onChange([])}>
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
