'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { Popover, PopoverTrigger, PopoverContent } from '../primitives/popover';

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxWithCreateProps {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /**
   * Renders a persistent "+ Create new <search term>" row. Opens the caller's
   * own creation dialog (over the current form, per the nested-entity-creation
   * UX rule) — this component only surfaces the entry point.
   */
  onCreateNew?: (searchTerm: string) => void;
  createLabel?: (searchTerm: string) => string;
  disabled?: boolean;
  className?: string;
}

export function ComboboxWithCreate({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  onCreateNew,
  createLabel = (term) => (term ? `Create "${term}"` : 'Create new'),
  disabled,
  className,
}: ComboboxWithCreateProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const selected = options.find((option) => option.value === value);
  const filtered = search
    ? options.filter((option) => option.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setOpen(false);
    setSearch('');
  };

  const handleCreate = () => {
    onCreateNew?.(search);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
        >
          {selected ? selected.label : placeholder}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="border-b border-border p-2">
          <Input
            autoFocus
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 && !onCreateNew && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          )}
          {filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Check className={cn('size-4', option.value === value ? 'opacity-100' : 'opacity-0')} />
              {option.label}
            </button>
          ))}
          {onCreateNew && (
            <button
              type="button"
              onClick={handleCreate}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-primary outline-none hover:bg-accent"
            >
              <Plus className="size-4" />
              {createLabel(search)}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
