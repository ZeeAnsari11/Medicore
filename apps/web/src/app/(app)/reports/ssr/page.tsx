'use client';

import { toAfterFrom } from '@/lib/date-range';
import { Suspense, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  FilterPanel,
} from '@medicore/ui';
import { useUrlState } from '@/hooks/use-url-state';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { BranchFilter } from '@/components/branch-filter';
import { useSsr, useSsrExport, type SsrView } from '@/hooks/use-ssr';
import { UserFilter } from '@/components/ssr/user-filter';
import { SsrTable, ssrColumnKeys } from '@/components/ssr/ssr-table';
import { SsrDrilldown } from '@/components/ssr/ssr-drilldown';


const VIEWS: Array<{ key: SsrView; label: string }> = [
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'product', label: 'Product' },
  { key: 'grouped', label: 'Manufacturer > Vendor > Product' },
];

/** Calendar day in Pakistan time (UTC+5, no DST), matching the server's day boundaries. */
const karachiDay = (offsetDays = 0) => {
  const d = new Date(Date.now() + 5 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
};
const monthStart = (day: string) => `${day.slice(0, 8)}01`;
const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

const PRESETS: Array<{ key: string; label: string; range: () => { from: string; to: string } }> = [
  { key: 'today', label: 'Today', range: () => ({ from: karachiDay(), to: karachiDay() }) },
  { key: 'yesterday', label: 'Yesterday', range: () => ({ from: karachiDay(-1), to: karachiDay(-1) }) },
  { key: '7d', label: 'Last 7 days', range: () => ({ from: karachiDay(-6), to: karachiDay() }) },
  { key: '30d', label: 'Last 30 days', range: () => ({ from: karachiDay(-29), to: karachiDay() }) },
  { key: 'month', label: 'This month', range: () => ({ from: monthStart(karachiDay()), to: karachiDay() }) },
  {
    key: 'lastMonth',
    label: 'Last month',
    range: () => {
      const t = karachiDay();
      const y = Number(t.slice(0, 4));
      const m = Number(t.slice(5, 7));
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      return { from: `${ly}-${String(lm).padStart(2, '0')}-01`, to: lastDayOfMonth(ly, lm) };
    },
  },
  { key: 'year', label: 'This year', range: () => ({ from: `${karachiDay().slice(0, 4)}-01-01`, to: karachiDay() }) },
];

const spinner = (
  <div className="flex h-96 items-center justify-center">
    <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
  </div>
);

export default function SsrPage() {
  return (
    <PageAccessGuard requires="ssr:read">
      <Suspense fallback={spinner}>
        <SsrContent />
      </Suspense>
    </PageAccessGuard>
  );
}

function SsrContent() {
  const url = useUrlState();
  const { has } = usePermissions();
  const exportSsr = useSsrExport();
  const branchFilter = useBranchFilter(url.get('branch'));

  const def = PRESETS[4].range();
  const from = url.get('from') || def.from;
  const to = url.get('to') || def.to;
  const view = (url.get('view') || 'manufacturer') as SsrView;
  const sort = url.get('sort') || 'netSaleValue:desc';
  const page = Number(url.get('page')) || 1;
  const rangeInvalid = from > to;

  const [searchInput, setSearchInput] = useState(url.get('q'));
  const q = url.get('q');
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput.trim() !== q) url.set({ q: searchInput.trim(), page: null }, { replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const filters: Record<string, string | undefined> = {
    from,
    to,
    branchId: branchFilter.branchId || undefined,
    salesmanIds: url.get('user') || undefined,
  };
  const params = { ...filters, view, sort, search: q || undefined, page: view === 'product' ? String(page) : undefined };

  const { report, isLoading, isFetching, error } = useSsr(params, !rangeInvalid);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<{ id: string; label: string } | null>(null);

  // Exports include only the columns still ticked in the Columns menu.
  const exportParams = {
    ...params,
    columns: report ? ssrColumnKeys(report).filter((k) => !hiddenCols.has(k)).join(',') : undefined,
  };

  const activePreset = PRESETS.find((p) => {
    const r = p.range();
    return r.from === from && r.to === to;
  })?.key;


  return (
    <div>
      <PageHeader
        title="SSR"
        description="Secondary Sales Report: what was sold, by manufacturer, vendor and product."
        actions={
          has('ssr:export') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={!report || rangeInvalid}>
                  <Download className="mr-2 size-4" /> Download Report
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => exportSsr(exportParams, 'xlsx', `ssr-${from}-to-${to}`)}>Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportSsr(exportParams, 'csv', `ssr-${from}-to-${to}`)}>CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportSsr(exportParams, 'pdf', `ssr-${from}-to-${to}`)}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <FilterPanel activeCount={[from !== def.from || to !== def.to, !!url.get('user')].filter(Boolean).length}>
            <div className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-1" role="group" aria-label="Period">
              {PRESETS.map((p) => (
                <Button
                  key={p.key}
                  size="sm"
                  variant={activePreset === p.key ? 'default' : 'outline'}
                  onClick={() => url.set({ ...p.range(), page: null })}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              From
              <Input type="date" value={from} max={to} onChange={(e) => url.set({ from: e.target.value, to: toAfterFrom(e.target.value, to), page: null })} className="w-40" />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              To
              <Input type="date" value={to} min={from} onChange={(e) => url.set({ from, to: e.target.value, page: null })} className="w-40" />
            </label>
            <BranchFilter filter={branchFilter} />
            {has('sales:view_all') && (
              <UserFilter
                value={url.get('user') ? url.get('user').split(',') : []}
                onChange={(v) => url.set({ user: v.join(','), page: null })}
              />
            )}
            <Button
              disabled={!((from !== def.from || to !== def.to || url.get('user') || searchInput))}
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchInput('');
                url.set({ from: null, to: null, user: null, q: null, page: null });
              }}
            >
              Clear filters
            </Button>
          </FilterPanel>
        </div>
      </div>

      {rangeInvalid && <Alert variant="destructive" className="mb-4">The From date must be on or before the To date.</Alert>}
      {error && !rangeInvalid && <Alert variant="destructive" className="mb-4">{error.message}</Alert>}
      {report?.warnings.map((w) => (
        <Alert key={w} className="mb-4">{w}</Alert>
      ))}

      {isLoading && !rangeInvalid ? (
        spinner
      ) : report ? (
        <div className={`space-y-4 ${isFetching ? 'opacity-70' : ''}`}>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="View max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-1 max-md:[&>*]:shrink-0">
            {VIEWS.map((v) => (
              <Button
                key={v.key}
                role="tab"
                aria-selected={view === v.key}
                size="sm"
                variant={view === v.key ? 'default' : 'outline'}
                onClick={() => url.set({ view: v.key === 'manufacturer' ? null : v.key, page: null })}
              >
                {v.label}
              </Button>
            ))}
          </div>

          {/* Always rendered, even with no rows, so the search box stays to be edited or cleared. */}
          <SsrTable
            report={report}
            search={searchInput}
            onSearch={setSearchInput}
            sort={sort}
            onSort={(v) => url.set({ sort: v, page: null })}
            onProductInvoices={(id, label) => setDrill({ id, label })}
            onPage={(p) => url.set({ page: p === 1 ? null : String(p) })}
            hidden={hiddenCols}
            onHiddenChange={setHiddenCols}
          />

          <p className="text-xs text-muted-foreground">
            {report.returnsAttribution === 'RETURN_DATE'
              ? 'Returns are counted on the date they were made.'
              : 'Returns are counted against the original sale date.'}{' '}
            Gross Sale is units sold less units returned; Net Sale Value includes tax. Pur Qty is net receipts (purchases
            less cancellations and returns, plus manual stock adjustments). Rate is the selling price. Bonus is the free
            units given (less any returned). Opening and Closing are rebuilt from stock movements. Dates are Pakistan time.
          </p>
        </div>
      ) : null}

      <SsrDrilldown product={drill} params={filters} onClose={() => setDrill(null)} />
    </div>
  );
}
