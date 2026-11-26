'use client';

import { Suspense, useEffect, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Button,
  ComboboxWithCreate,
  Input,
  Switch,
  FilterPanel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@medicore/ui';
import { usePartyBalances, usePartyLedger, type PartyKind } from '@/hooks/use-ledgers';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useUrlState } from '@/hooks/use-url-state';
import { defaultRange, LedgerFilters } from './ledger-filters';
import { CustomerName } from '@/lib/party-label';
import { DateRangeFilter, StatBox } from '@/components/layout/stat-cards';
import { LedgerTable } from './ledger-table';
import { LedgerExportButtons } from './ledger-export-buttons';

export interface PartyOption {
  value: string;
  label: string;
  /** Shown as a pin chip after the label (a customer's territory). */
  place?: string;
}

export interface PartyLedgerConfig {
  kind: PartyKind;
  singular: string;
  plural: string;
  description: string;
  billedLabel: string;
  settledLabel: string;
  voidLabel: string;
  /** Accounts Receivable / Accounts Payable, as on the dashboard. */
  accountLabel: string;
  /** Wording for a positive and a negative closing balance. */
  positiveHint: string;
  negativeHint: string;
  useOptions: () => PartyOption[];
}

const spinner = (
  <div className="flex h-96 items-center justify-center">
    <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
  </div>
);

const money = (n: number) => n.toFixed(2);

export function PartyLedgerPage({ config }: { config: PartyLedgerConfig }) {
  return (
    <PageAccessGuard requires={config.kind === 'vendors' ? 'acc_vendor_ledger:read' : 'acc_customer_ledger:read'}>
      <Suspense fallback={spinner}>
        <PartyLedgerContent config={config} />
      </Suspense>
    </PageAccessGuard>
  );
}

function SummaryCard({ title, value, hint }: { title: string; value: number; hint?: string }) {
  return <StatBox item={{ title, value, hint }} />;
}

function PartyLedgerContent({ config }: { config: PartyLedgerConfig }) {
  const exportPermission = config.kind === 'vendors' ? 'acc_vendor_ledger:export' : 'acc_customer_ledger:export';
  const url = useUrlState();
  const options = config.useOptions();

  const partyId = url.get('party');
  const view = url.get('view') || (partyId ? 'ledger' : 'list');
  const branchFilter = useBranchFilter(url.get('branch'));
  const branchId = branchFilter.branchId;
  const def = defaultRange();
  const from = url.get('from') || def.from;
  const to = url.get('to') || def.to;
  const page = Number(url.get('page')) || 1;
  const limit = Number(url.get('limit')) || 50;

  const { ledger, isLoading, isFetching, error } = usePartyLedger(config.kind, view === 'ledger' ? partyId || null : null, {
    branchId: branchId || undefined,
    from,
    to,
    page,
    limit,
  });

  // List view state, kept in the URL as well.
  const [searchInput, setSearchInput] = useState(url.get('q'));
  const q = url.get('q');
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput.trim() !== q) url.set({ q: searchInput.trim(), lpage: null }, { replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const sortBy = (url.get('sort') === 'name' ? 'name' : 'balance') as 'name' | 'balance';
  const sortDir = (url.get('dir') === 'asc' ? 'asc' : url.get('dir') === 'desc' ? 'desc' : sortBy === 'name' ? 'asc' : 'desc') as 'asc' | 'desc';
  const listPage = Number(url.get('lpage')) || 1;
  const hasBalance = url.get('bal') === '1';
  const { balances, isLoading: listLoading, isFetching: listFetching } = usePartyBalances(
    config.kind,
    { branchId: branchId || undefined, search: q || undefined, hasBalance, from: url.get('from') || undefined, to: url.get('to') || undefined, sortBy, sortDir, page: listPage, limit: 25 },
    view === 'list',
  );

  const toggleSort = (column: 'name' | 'balance') => {
    if (sortBy === column) url.set({ sort: column, dir: sortDir === 'asc' ? 'desc' : 'asc', lpage: null });
    else url.set({ sort: column, dir: column === 'name' ? 'asc' : 'desc', lpage: null });
  };
  const sortIcon = (column: 'name' | 'balance') =>
    sortBy !== column ? <ArrowUpDown className="size-3.5 opacity-40" /> : sortDir === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;

  const filterChange = (patch: { from?: string; to?: string }) =>
    url.set({ ...patch, from: patch.from ?? from, to: patch.to ?? to, page: null });

  const closing = ledger?.closingBalance ?? 0;
  const s = ledger?.summary;

  return (
    <>

      <PageHeader
        back={{ href: '/accounting', label: 'Back to Accounting' }}
        title={`${config.singular} Ledger`}
        description={config.description}
        actions={
          <div className="flex items-center gap-1.5" role="group" aria-label="View">
            <Button size="sm" variant={view === 'list' ? 'default' : 'outline'} onClick={() => url.set({ view: 'list' })}>
              All {config.plural}
            </Button>
            <Button size="sm" variant={view === 'ledger' ? 'default' : 'outline'} onClick={() => url.set({ view: 'ledger' })}>
              Ledger
            </Button>
          </div>
        }
      />

      <div className="sticky top-0 z-10 -mx-1 mb-4 space-y-3 bg-background/95 px-1 py-3 backdrop-blur">
        {view === 'ledger' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ComboboxWithCreate
                options={options}
                value={partyId}
                onChange={(v) => url.set({ party: v, page: null })}
                placeholder={`Select a ${config.singular.toLowerCase()}`}
                searchPlaceholder={`Search ${config.plural}...`}
                emptyMessage={`No ${config.plural} found.`}
                className="w-64"
              />
              {partyId && (
                <LedgerExportButtons
                  permission={exportPermission}
                  path={`/accounting/${config.kind}/${partyId}/ledger/export`}
                  query={{ branchId: branchId || undefined, from, to }}
                  baseName={`${config.kind}-ledger-${from}-to-${to}`}
                  statement
                  disabled={!ledger}
                />
              )}
            </div>
            <LedgerFilters from={from} to={to} branchFilter={branchFilter} onChange={filterChange} />
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder={`Search ${config.plural}...`}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full sm:w-64 max-md:flex-1"
            />
            <DateRangeFilter
              from={url.get('from')}
              to={url.get('to')}
              onChange={(r) => url.set({ from: r.from || null, to: r.to || null, lpage: null })}
              inline
            />
            <FilterPanel activeCount={hasBalance ? 1 : 0}>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={hasBalance} onCheckedChange={(v) => url.set({ bal: v ? '1' : null, lpage: null })} />
                Has balance only
              </label>
              <Button
                disabled={!((searchInput || hasBalance))}
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchInput('');
                  url.set({ q: null, bal: null, lpage: null }, { replace: true });
                }}
              >
                Clear filters
              </Button>
              <div className="ml-auto">
                <LedgerExportButtons
                  permission={exportPermission}
                  path={`/accounting/${config.kind}/balances/export`}
                  query={{
                    branchId: branchId || undefined,
                    search: q || undefined,
                    hasBalance: hasBalance ? 'true' : undefined,
                    from: url.get('from') || undefined,
                    to: url.get('to') || undefined,
                    sortBy,
                    sortDir,
                  }}
                  baseName={`all-${config.kind}-ledger`}
                  disabled={!balances}
                />
              </div>
            </FilterPanel>
          </div>
        )}
      </div>

      {view === 'list' ? (
        listLoading || !balances ? (
          spinner
        ) : (
          <div className={listFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
            {balances.summary && (
              <div className="mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
                  <SummaryCard title="Opening balance" value={balances.summary.openingBalance} />
                  <SummaryCard title={config.billedLabel} value={balances.summary.billed} />
                  <SummaryCard title={config.settledLabel} value={balances.summary.settled} />
                  <SummaryCard title="Total returns" value={balances.summary.returns} />
                  <SummaryCard
                    title="Closing balance"
                    value={balances.summary.closingBalance}
                    hint={balances.summary.closingBalance >= 0 ? config.positiveHint : config.negativeHint}
                  />
                </div>
              </div>
            )}
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button type="button" className="flex items-center gap-1.5" onClick={() => toggleSort('name')}>
                        {config.singular} {sortIcon('name')}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">{config.billedLabel}</TableHead>
                    <TableHead className="text-right">{config.settledLabel}</TableHead>
                    <TableHead className="text-right">Total returns</TableHead>
                    <TableHead className="text-right">{config.accountLabel}</TableHead>
                    <TableHead className="text-right">Advance</TableHead>
                    <TableHead className="text-right">
                      <button type="button" className="ml-auto flex items-center gap-1.5" onClick={() => toggleSort('balance')}>
                        Balance {sortIcon('balance')}
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No {config.plural} found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    balances.items.map((row) => (
                      <TableRow
                        key={row.partyId}
                        className="cursor-pointer"
                        onClick={() => url.set({ view: 'ledger', party: row.partyId, page: null })}
                      >
                        <TableCell><CustomerName name={row.name} territory={row.territory} /></TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.billed ?? 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.settled ?? 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.returns ?? 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.accountBalance)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.advanceBalance)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{money(row.balance)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {balances.total} {balances.total === 1 ? config.singular.toLowerCase() : config.plural}
              </span>
              <div className="flex items-center gap-3">
                <span>
                  Page {balances.page} of {Math.max(1, Math.ceil(balances.total / balances.limit))}
                </span>
                <Button variant="outline" size="sm" disabled={balances.page <= 1} onClick={() => url.set({ lpage: String(balances.page - 1) })}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={balances.page >= Math.ceil(balances.total / balances.limit)}
                  onClick={() => url.set({ lpage: String(balances.page + 1) })}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )
      ) : !partyId ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Select a {config.singular.toLowerCase()} to view their ledger.</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load the ledger</span>
        </Alert>
      ) : isLoading || !ledger || !s ? (
        spinner
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
            <SummaryCard title="Opening balance" value={s.openingBalance} />
            <SummaryCard title={config.billedLabel} value={s.billed} />
            <SummaryCard title={config.settledLabel} value={s.settled} />
            <SummaryCard title="Total returns" value={s.returns} />
            <SummaryCard title="Closing balance" value={s.closingBalance} hint={closing >= 0 ? config.positiveHint : config.negativeHint} />
          </div>
          <LedgerTable
            variant="party"
            partyKind={config.kind}
            ledger={ledger}
            closingLabel={`Closing balance — ${closing >= 0 ? config.positiveHint.toLowerCase() : config.negativeHint.toLowerCase()}`}
            isFetching={isFetching}
            onPageChange={(p) => url.set({ page: String(p) })}
            onLimitChange={(l) => url.set({ limit: String(l), page: null })}
          />
        </div>
      )}
    </>
  );
}
