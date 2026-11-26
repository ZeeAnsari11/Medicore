'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { Popover, PopoverTrigger, PopoverContent } from '../primitives/popover';
import { PlaceChip } from '../primitives/place-chip';

export interface ComboboxOption {
  value: string;
  label: string;
  /** A place shown as a pin chip after the label (e.g. a customer's territory); searched together with the label. */
  place?: string;
  /** Secondary text shown beside the label (e.g. a product's generic name); searchable when `hintSearchLabel` is on. */
  hint?: string;
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
  /**
   * Adds a checkbox with this label under the search box. While ticked, the search matches the options'
   * `hint` instead of their label (e.g. "Search by generic name"). It resets each time the list closes.
   */
  hintSearchLabel?: string;
  disabled?: boolean;
  className?: string;
  /** Applied to the trigger button — lets callers target it for imperative focus (e.g. after appending a new row). */
  id?: string;
  /** Forwarded to the popover content; call preventDefault to keep focus from returning to the trigger. */
  onCloseAutoFocus?: (event: Event) => void;
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
  hintSearchLabel,
  disabled,
  className,
  id,
  onCloseAutoFocus,
}: ComboboxWithCreateProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [byHint, setByHint] = React.useState(false);
  const listId = React.useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const selected = options.find((option) => option.value === value);
  const needle = search.toLowerCase();
  const filtered = search
    ? options.filter((option) => (byHint ? (option.hint ?? '') : `${option.label} ${option.place ?? ''}`).toLowerCase().includes(needle))
    : options;

  // The optional "Create new" row is the last keyboard-reachable row.
  const rowCount = filtered.length + (onCreateNew ? 1 : 0);

  const listRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

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
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setActiveIndex(0);
        if (!next) setByHint(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate">{selected.label}</span>
              {selected.place && <PlaceChip className="max-w-[50%] shrink">{selected.place}</PlaceChip>}
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[max(var(--radix-popover-trigger-width),28rem)] max-w-[calc(100vw-2rem)] p-0"
        align="start"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="border-b border-border p-2">
          <Input
            autoFocus
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={rowCount > 0 ? optionId(activeIndex) : undefined}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // The first match is highlighted whenever the results change.
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (rowCount === 0) return;
                setActiveIndex((i) => (e.key === 'ArrowDown' ? (i + 1) % rowCount : (i - 1 + rowCount) % rowCount));
              } else if (e.key === 'Home' || e.key === 'End') {
                e.preventDefault();
                if (rowCount > 0) setActiveIndex(e.key === 'Home' ? 0 : rowCount - 1);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const option = filtered[activeIndex];
                if (option) handleSelect(option.value);
                else if (onCreateNew && activeIndex === filtered.length) handleCreate();
              }
            }}
          />
          {hintSearchLabel && (
            <label className="mt-2 flex cursor-pointer items-center gap-2 px-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={byHint}
                onChange={(e) => {
                  setByHint(e.target.checked);
                  setActiveIndex(0);
                }}
              />
              {hintSearchLabel}
            </label>
          )}
        </div>
        <div ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 && !onCreateNew && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          )}
          {filtered.map((option, index) => (
            <button
              key={option.value}
              id={optionId(index)}
              data-index={index}
              data-active={index === activeIndex}
              role="option"
              aria-selected={option.value === value}
              tabIndex={-1}
              type="button"
              onClick={() => handleSelect(option.value)}
              onMouseMove={() => index !== activeIndex && setActiveIndex(index)}
              className={cn(
                'flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none data-[active=true]:bg-accent data-[active=true]:text-accent-foreground',
              )}
            >
              <Check className={cn('mt-0.5 size-4 shrink-0', option.value === value ? 'opacity-100' : 'opacity-0')} />
              <span className={cn('min-w-0 flex-1 break-words', option.place ? 'font-medium' : 'truncate')}>{option.label}</span>
              {option.place && <PlaceChip className="ml-2 max-w-[45%] shrink-0 self-start">{option.place}</PlaceChip>}
              {option.hint && <span className="ml-2 max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{option.hint}</span>}
            </button>
          ))}
          {onCreateNew && (
            <button
              id={optionId(filtered.length)}
              data-index={filtered.length}
              data-active={activeIndex === filtered.length}
              role="option"
              aria-selected={false}
              tabIndex={-1}
              type="button"
              onClick={handleCreate}
              onMouseMove={() => activeIndex !== filtered.length && setActiveIndex(filtered.length)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-primary outline-none data-[active=true]:bg-accent"
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
