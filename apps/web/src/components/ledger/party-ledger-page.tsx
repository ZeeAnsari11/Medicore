'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ComboboxWithCreate,
  Input,
  Switch,
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
import { LedgerTable } from './ledger-table';
import { LedgerExportButtons } from './ledger-export-buttons';

export interface PartyOption {
  value: string;
  label: string;
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
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{money(value)}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function PartyLedgerContent({ config }: { config: PartyLedgerConfig }) {
  const router = useRouter();
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
    { branchId: branchId || undefined, search: q || undefined, hasBalance, sortBy, sortDir, page: listPage, limit: 25 },
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
  const extras = s
    ? [
        s.voids ? `${config.voidLabel} ${money(s.voids)}` : null,
        s.advances ? `Advances ${money(s.advances)}` : null,
        s.other ? `Adjustments ${money(s.other)}` : null,
      ].filter(Boolean)
    : [];

  return (
    <>
      <button onClick={() => router.push('/accounting')} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Accounting
      </button>

      <PageHeader
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
              className="w-64"
            />
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
          </div>
        )}
      </div>

      {view === 'list' ? (
        listLoading || !balances ? (
          spinner
        ) : (
          <div className={listFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
            {Math.abs(balances.totals.unattributed) > 0.005 && (
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <span>
                  {config.accountLabel} is {money(balances.totals.accountTotal)}, but {config.singular.toLowerCase()} balances add up to{' '}
                  {money(balances.totals.partiesAccountTotal)}. {money(balances.totals.unattributed)} is not linked to any{' '}
                  {config.singular.toLowerCase()} (for example, the unpaid part of walk-in invoices).
                </span>
              </Alert>
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
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
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
                        <TableCell className="font-medium">{row.name}</TableCell>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard title="Opening balance" value={s.openingBalance} />
            <SummaryCard title={config.billedLabel} value={s.billed} />
            <SummaryCard title={config.settledLabel} value={s.settled} />
            <SummaryCard title="Total returns" value={s.returns} />
            <SummaryCard title="Closing balance" value={s.closingBalance} hint={closing >= 0 ? config.positiveHint : config.negativeHint} />
          </div>
          {extras.length > 0 && <p className="text-sm text-muted-foreground">{extras.join(' · ')}</p>}
          <LedgerTable
            variant="party"
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
