'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ListChecks } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { Alert, Badge, Button, DataTable, Input, type ColumnDef } from '@medicore/ui';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { usePermissions } from '@/hooks/use-permissions';
import { RECEIPT_KIND, useCashTransactionsPage, type CashTransactionSummary, type ReceiptKind } from '@/hooks/use-cash-receipts';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
// Marks a filter that is currently narrowing the list.
const ACTIVE = 'border-primary ring-1 ring-primary';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB');

export default function CashReceiptTransactionsPage() {
  const router = useRouter();
  const { branchId } = useBranchFilter();
  const { has } = usePermissions();
  // Sales cash receipts (T-) or purchase receipts (PT-).
  const [kind, setKind] = useState<ReceiptKind>('sale');
  const purchase = kind === 'purchase';
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter change goes back to the first page.
  useEffect(() => {
    setPageIndex(0);
  }, [branchId, startDate, endDate, search, pageSize, kind]);

  const { transactions, total, isLoading, error } = useCashTransactionsPage(
    {
      branchId,
      q: search || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: pageIndex + 1,
      limit: pageSize,
    },
    true,
    kind,
  );

  const hasFilters = !!startDate || !!endDate || !!search;
  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSearchInput('');
  };

  const columns = useMemo<ColumnDef<CashTransactionSummary>[]>(
    () => [
      { accessorKey: 'transactionNumber', header: purchase ? 'CP Transaction #' : 'CR Transaction #' },
      { accessorKey: 'date', header: 'Date', cell: ({ getValue }) => fmtDate(getValue() as string) },
      {
        id: 'customers',
        header: purchase ? 'Vendors' : 'Customers',
        cell: ({ row }) => {
          const names = row.original.customers;
          return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
        },
      },
      { accessorKey: 'count', header: 'Entries' },
      { accessorKey: 'total', header: 'Total', cell: ({ getValue }) => money(getValue() as number) },
      {
        id: 'edited',
        header: 'Last edited',
        cell: ({ row }) =>
          row.original.editedAt ? (
            <span className="flex items-center gap-2">
              {fmtDate(row.original.editedAt)}
              <Badge variant="secondary">v{row.original.version}</Badge>
            </span>
          ) : (
            '—'
          ),
      },
    ],
    [purchase],
  );

  return (
    <PageAccessGuard requires={['cash_receipt:read', 'cash_payment:read']}>
      <PageHeader
        title={purchase ? 'Bulk Purchase Receipt Transactions' : 'Cash Receipt Transactions'}
        description={purchase ? 'Saved vendor payments. Open one to view or edit it' : 'Saved cash receipts. Open one to view or edit it'}
      />
      <div className="mb-4 inline-flex rounded-md border p-0.5" role="group" aria-label="Transaction type">
        {(['sale', 'purchase'] as const).map((k) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={kind === k ? 'default' : 'ghost'}
            aria-pressed={kind === k}
            disabled={!has(`${RECEIPT_KIND[k].permission}:read`)}
            onClick={() => setKind(k)}
          >
            {k === 'sale' ? 'Sales' : 'Purchase'}
          </Button>
        ))}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load transactions</span>
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          From
          <Input
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(e) => setStartDate(e.target.value)}
            className={`w-40 ${startDate ? ACTIVE : ''}`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          To
          <Input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
            className={`w-40 ${endDate ? ACTIVE : ''}`}
          />
        </label>
        <Button disabled={!hasFilters} variant="outline" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
        <Button className="ml-auto" size="sm" onClick={() => router.push('/sales/cash-receipt')}>
          {purchase ? 'New Purchase Receipt' : 'New Cash Receipt'}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : total === 0 && !hasFilters ? (
        <EmptyState icon={ListChecks} title="No transactions yet" description={`Every saved ${purchase ? 'purchase receipt' : 'cash receipt'} gets a number like ${RECEIPT_KIND[kind].prefix}0001`} />
      ) : (
        <DataTable
          columns={columns}
          data={transactions}
          searchPlaceholder={`Search by ${RECEIPT_KIND[kind].prefix}0001, ${purchase ? 'vendor' : 'customer'} or invoice #...`}
          emptyMessage="No transactions match the current filters."
          search={{ value: searchInput, onChange: setSearchInput }}
          hideClearFilters
          pagination={{
            pageIndex,
            pageSize,
            total,
            onPageChange: setPageIndex,
            onPageSizeChange: setPageSize,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
          }}
          onRowClick={(row) => router.push(`/sales/cash-receipt?transaction=${encodeURIComponent(row.transactionNumber)}`)}
        />
      )}
    </PageAccessGuard>
  );
}
