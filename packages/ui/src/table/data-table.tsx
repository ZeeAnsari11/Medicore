'use client';

import * as React from 'react';
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from './table';
import { Input } from '../primitives/input';
import { Button } from '../primitives/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '../primitives/dropdown-menu';
import { FilterPanel } from './filter-panel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../forms/select';

/** Opt-in server-side paging: `data` is just the current page and `total` is the full row count. */
export interface DataTableServerPagination {
  pageIndex: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: number[];
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** Opt-in server-side search: the table stops filtering rows itself. */
export interface DataTableServerSearch {
  value: string;
  onChange: (value: string) => void;
}

/** Rows-per-page choices every client-paged table offers unless it passes its own. */
export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500];

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  pageSize?: number;
  /** When provided, rows become clickable (e.g. to open a detail view). */
  onRowClick?: (row: TData) => void;
  pagination?: DataTableServerPagination;
  search?: DataTableServerSearch;
  /** Extra controls (e.g. another search box) shown next to the search input. */
  toolbar?: React.ReactNode;
  /** Client-side paging only: the "Rows per page" choices (default 10, 25, 50, 100, 250, 500). */
  pageSizeOptions?: number[];
  /** True while a filter outside the table (e.g. one in `toolbar`) is applied; enables the Clear filters button. */
  filtersActive?: boolean;
  /** Resets those outside filters. The Clear filters button also empties the search box. */
  onClearFilters?: () => void;
  /** For pages that already render their own Clear filters button. */
  hideClearFilters?: boolean;
  /**
   * Called with the rows left after the table's own search (all pages, not just the visible one), so a report can match
   * what the person searched for. Pass a stable function (e.g. from useShownRows).
   */
  onFilteredRowsChange?: (rows: TData[]) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results.',
  pageSize = 10,
  onRowClick,
  pagination,
  search,
  toolbar,
  pageSizeOptions: pageSizeChoices = DEFAULT_PAGE_SIZE_OPTIONS,
  filtersActive,
  onClearFilters,
  hideClearFilters,
  onFilteredRowsChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  // A table's own starting size is always one of the choices.
  const pageSizeOptions = pageSizeChoices.includes(pageSize) ? pageSizeChoices : [...pageSizeChoices, pageSize].sort((a, b) => a - b);
  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : undefined;

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
      ...(pagination && { pagination: { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize } }),
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(pagination
      ? { manualPagination: true, pageCount }
      : { getPaginationRowModel: getPaginationRowModel() }),
    ...(!search && { getFilteredRowModel: getFilteredRowModel() }),
    initialState: { pagination: { pageSize } },
  });

  // Columns with a text heading can be switched off from the Columns menu; the actions column (no heading) stays.
  const hideableColumns = table.getAllLeafColumns().filter((c) => typeof c.columnDef.header === 'string' && c.columnDef.header.trim() !== '');

  const filteredRows = table.getFilteredRowModel().rows;
  React.useEffect(() => {
    onFilteredRowsChange?.(filteredRows.map((r) => r.original));
  }, [filteredRows, onFilteredRowsChange]);

  // An empty panel would only show a pointless Filters button on phones.
  const hasFilterControls = !!toolbar || !hideClearFilters || (!!pageSizeOptions && !pagination);
  const searchValue = search ? search.value : globalFilter;
  const setSearchValue = (value: string) => (search ? search.onChange(value) : table.setGlobalFilter(value));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="max-w-sm max-md:min-w-0 max-md:flex-1"
        />
          {hasFilterControls && (
          <FilterPanel activeCount={filtersActive ? 1 : 0}>
            {toolbar}
            {!hideClearFilters && (
              <Button
                disabled={searchValue === '' && !filtersActive}
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchValue('');
                  onClearFilters?.();
                }}
              >
                Clear filters
              </Button>
            )}
            {pageSizeOptions && !pagination && (
              <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
                <span>Rows per page</span>
                <Select
                  value={String(table.getState().pagination.pageSize)}
                  onValueChange={(value) => table.setPageSize(Number(value))}
                >
                  <SelectTrigger className="h-9 w-20" aria-label="Rows per page">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </FilterPanel>
        )}
        {hideableColumns.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto">
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-auto">
              {hideableColumns.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={c.getIsVisible()}
                  // Keep the menu open so several columns can be switched in one go.
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(v) => c.toggleVisibility(!!v)}
                >
                  {c.columnDef.header as string}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDirection = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className={cn(
                            'flex items-center gap-1.5 select-none',
                            canSort && 'cursor-pointer hover:text-foreground',
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDirection === 'asc' ? (
                            <ArrowUp className="size-3.5" />
                          ) : sortDirection === 'desc' ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={
                    onRowClick
                      ? (e) => {
                          // Row actions (menus, switches, links) must not also open the row.
                          if ((e.target as HTMLElement).closest('button, a, input, label, [role="menu"], [role="menuitem"], [role="switch"], [role="checkbox"]')) return;
                          onRowClick(row.original);
                        }
                      : undefined
                  }
                  className={cn(onRowClick && 'cursor-pointer')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            {pagination.pageSizeOptions && (
              <>
                <span>Rows per page</span>
                <Select
                  value={String(pagination.pageSize)}
                  onValueChange={(value) => pagination.onPageSizeChange(Number(value))}
                >
                  <SelectTrigger className="h-8 w-20" aria-label="Rows per page">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pagination.pageSizeOptions.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            <span>
              {pagination.total} record{pagination.total === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              Page {pagination.pageIndex + 1} of {pageCount}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => pagination.onPageChange(pagination.pageIndex - 1)}
                disabled={pagination.pageIndex <= 0}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pagination.onPageChange(pagination.pageIndex + 1)}
                disabled={pagination.pageIndex + 1 >= (pageCount ?? 1)}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        table.getPageCount() > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
