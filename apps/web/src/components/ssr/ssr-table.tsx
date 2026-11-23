'use client';

import { Fragment, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsUpDown, FileText } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@medicore/ui';
import type { SsrReport, SsrRow } from '@/hooks/use-ssr';

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '-' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

interface Col {
  key: string;
  label: string;
  sortKey?: string;
  cost?: boolean;
  compare?: boolean;
  render: (r: SsrRow) => React.ReactNode;
}

const COLS: Col[] = [
  { key: 'pack', label: 'Pack', render: (r) => r.pack || '' },
  { key: 'rate', label: 'Rate', render: (r) => (r.rate === undefined ? '' : money(r.rate)) },
  { key: 'opening', label: 'Opening Qty', sortKey: 'opening', render: (r) => qty(r.opening) },
  { key: 'purchased', label: 'Pur Qty', sortKey: 'purchased', render: (r) => qty(r.purchased) },
  { key: 'totalStock', label: 'Total Stock', sortKey: 'totalStock', render: (r) => qty(r.totalStock) },
  { key: 'grossSale', label: 'Gross Sale', sortKey: 'grossSale', render: (r) => qty(r.grossSale) },
  { key: 'bonus', label: 'Bonus N. Sale', render: (r) => qty(r.bonus) },
  { key: 'netSale', label: 'Net Sale', sortKey: 'netSale', render: (r) => qty(r.netSale) },
  { key: 'netSaleValue', label: 'Net Sale Value', sortKey: 'netSaleValue', render: (r) => <b>{money(r.netSaleValue)}</b> },
  { key: 'closingQty', label: 'Closing Qty', sortKey: 'closingQty', render: (r) => qty(r.closingQty) },
  { key: 'closingValue', label: 'Closing Stock (TP)', sortKey: 'closingValue', render: (r) => money(r.closingValue) },
  { key: 'closingValueCp', label: 'Closing Stock (CP)', sortKey: 'closingValueCp', cost: true, render: (r) => money(r.closingValueCp) },
  { key: 'prevNetSales', label: 'Prev. net sales', sortKey: 'prevNetSales', compare: true, render: (r) => money(r.prevNetSales) },
  {
    key: 'changePct',
    label: 'Change',
    sortKey: 'changePct',
    compare: true,
    render: (r) =>
      r.changePct === null || r.changePct === undefined ? (
        '-'
      ) : (
        <span className={`inline-flex items-center gap-1 ${r.changePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {r.changePct >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(r.changePct)}%
        </span>
      ),
  },
];

interface SsrTableProps {
  report: SsrReport;
  search: string;
  onSearch: (value: string) => void;
  sort: string;
  onSort: (sort: string) => void;
  onProductInvoices: (productId: string, label: string) => void;
  onPage: (page: number) => void;
  /** Column keys unticked in the Columns menu; owned by the page so exports can follow it. */
  hidden: Set<string>;
  onHiddenChange: (hidden: Set<string>) => void;
}

/** Columns that exist for this report (cost and comparison columns are conditional). */
export const ssrColumnKeys = (report: SsrReport) =>
  COLS.filter((c) => (!c.cost || report.canViewCost) && (!c.compare || report.totals.prevNetSales !== undefined)).map((c) => c.key);

export function SsrTable({ report, search, onSearch, sort, onSort, onProductInvoices, onPage, hidden, onHiddenChange }: SsrTableProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const comparing = report.totals.prevNetSales !== undefined;
  const cols = COLS.filter((c) => (!c.cost || report.canViewCost) && (!c.compare || comparing));
  const shown = cols.filter((c) => !hidden.has(c.key));
  const [sortField, sortDir] = sort.split(':');

  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const sortBy = (key?: string) => {
    if (!key) return;
    onSort(`${key}:${sortField === key && sortDir === 'desc' ? 'asc' : 'desc'}`);
  };

  const firstHeader: Record<string, string> = {
    manufacturer: 'Manufacturer',
    vendor: 'Vendor',
    product: 'Product',
    grouped: 'Manufacturer / Vendor / Product',
  };

  const renderRow = (row: SsrRow, depth: number, path: string): React.ReactNode => {
    const k = `${path}/${row.kind}:${row.key}`;
    const subs = [...(row.children ?? []), ...(row.batches ?? [])];
    const expandable = subs.length > 0;
    const isOpen = open.has(k);
    return (
      <Fragment key={k}>
        <TableRow className={depth === 0 ? 'bg-muted/30 font-medium' : ''}>
          <TableCell style={{ paddingLeft: 12 + depth * 20 }}>
            <div className="flex items-center gap-1">
              {expandable ? (
                <button type="button" onClick={() => toggle(k)} aria-label={isOpen ? 'Collapse' : 'Expand'}>
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span className="w-4" />
              )}
              <span className={row.kind === 'batch' ? 'text-muted-foreground' : ''}>
                {row.kind === 'batch' ? `Batch ${row.label}` : row.label}
              </span>
              {row.kind === 'product' && (
                <button
                  type="button"
                  className="ml-2 text-muted-foreground hover:text-foreground"
                  title="Show invoices"
                  onClick={() => onProductInvoices(row.key, row.label)}
                >
                  <FileText className="h-4 w-4" />
                </button>
              )}
            </div>
          </TableCell>
          {shown.map((c) => (
            <TableCell key={c.key} className="text-right tabular-nums">
              {c.render(row)}
            </TableCell>
          ))}
        </TableRow>
        {isOpen && (
          <>
            {row.children?.map((c) => renderRow(c, depth + 1, k))}
            {row.batches && row.batches.length > 0 && (
              <>
                <SubHeading depth={depth + 1} cols={shown.length} text="Batches" />
                {row.batches.map((c) => renderRow(c, depth + 1, k))}
              </>
            )}
          </>
        )}
      </Fragment>
    );
  };

  const pages = Math.max(1, Math.ceil(report.totalRows / report.pageSize));

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <Input
          className="max-w-xs"
          placeholder="Search in table..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-auto">
            {cols.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.key}
                checked={!hidden.has(c.key)}
                onCheckedChange={() => {
                  const next = new Set(hidden);
                  if (next.has(c.key)) next.delete(c.key);
                  else next.add(c.key);
                  onHiddenChange(next);
                }}
                onSelect={(e) => e.preventDefault()}
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-64">{firstHeader[report.view]}</TableHead>
              {shown.map((c) => (
                <TableHead key={c.key} className="text-right whitespace-nowrap">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => sortBy(c.sortKey)}>
                    {c.label}
                    {sortField === c.sortKey ? (
                      sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.map((r) => renderRow(r, 0, ''))}
            <TableRow className="border-t-2 bg-muted/50 font-semibold">
              <TableCell>{search.trim() ? 'Total (matching search)' : 'Grand total'}</TableCell>
              {shown.map((c) => (
                <TableCell key={c.key} className="text-right tabular-nums">
                  {c.render(report.totals)}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {report.view === 'product' && pages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t p-3 text-sm">
          <span className="text-muted-foreground">
            Page {report.page} of {pages} ({report.totalRows} products)
          </span>
          <Button variant="outline" size="sm" disabled={report.page <= 1} onClick={() => onPage(report.page - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={report.page >= pages} onClick={() => onPage(report.page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function SubHeading({ depth, cols, text }: { depth: number; cols: number; text: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={cols + 1}
        className="py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        style={{ paddingLeft: 12 + depth * 20 }}
      >
        {text}
      </TableCell>
    </TableRow>
  );
}
