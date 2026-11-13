'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Plus, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  ComboboxWithCreate,
  DataTable,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ColumnDef,
} from '@medicore/ui';
import { useOrderBookers, useSale, useSalesPage } from '@/hooks/use-sales';
import { OpenFromUrl } from '@/components/open-from-url';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useCustomers } from '@/hooks/use-customers';
import { usePermissions } from '@/hooks/use-permissions';
import { PaymentStatus, ReturnStatus } from '@medicore/shared-types';
import { SaleDetailDialog } from './components/sale-detail-dialog';
import type { Sale } from '@medicore/shared-types';

const ALL = '__all__';
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500];

const paymentVariant: Record<PaymentStatus, 'default' | 'secondary' | 'warning'> = {
  PAID: 'default',
  PARTIAL: 'warning',
  UNPAID: 'secondary',
};

export default function SalesPage() {
  const router = useRouter();
  const { has } = usePermissions();
  const { customers } = useCustomers();

  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [detailSale, setDetailSale] = useState<Sale | null>(null);
  // Opened from a link elsewhere (?open=<id>), e.g. a ledger row.
  const [openId, setOpenId] = useState<string | null>(null);
  const { sale: linkedSale } = useSale(openId, selectedBranchId);
  useEffect(() => {
    if (linkedSale) {
      setDetailSale(linkedSale);
      setOpenId(null);
    }
  }, [linkedSale]);
  const [customerId, setCustomerId] = useState(ALL);
  const [orderBookerId, setOrderBookerId] = useState(ALL);
  const [paymentStatus, setPaymentStatus] = useState(ALL);
  const [returnStatus, setReturnStatus] = useState(ALL);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter change goes back to the first page.
  useEffect(() => {
    setPageIndex(0);
  }, [selectedBranchId, customerId, orderBookerId, paymentStatus, returnStatus, startDate, endDate, search, pageSize]);

  const { sales, total, isLoading, error } = useSalesPage({
    branchId: selectedBranchId,
    customerId: customerId === ALL ? undefined : customerId,
    orderBookerId: orderBookerId === ALL ? undefined : orderBookerId,
    paymentStatus: paymentStatus === ALL ? undefined : paymentStatus,
    returnStatus: returnStatus === ALL ? undefined : returnStatus,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    search: search || undefined,
    page: pageIndex + 1,
    limit: pageSize,
  });

  const customerOptions = useMemo(
    () => [{ value: ALL, label: 'All customers' }, ...customers.map((c) => ({ value: c.id, label: c.name }))],
    [customers],
  );

  // Only people who can see every sale get the filter and column; an Order Booker only has their own.
  const canSeeAll = has('sales:view_all');
  const { orderBookers } = useOrderBookers(selectedBranchId, canSeeAll);
  const hasFilters = customerId !== ALL || orderBookerId !== ALL || paymentStatus !== ALL || returnStatus !== ALL || !!startDate || !!endDate || !!search;
  const clearFilters = () => {
    setCustomerId(ALL);
    setOrderBookerId(ALL);
    setPaymentStatus(ALL);
    setReturnStatus(ALL);
    setStartDate('');
    setEndDate('');
    setSearchInput('');
  };


  const columns = useMemo<ColumnDef<Sale>[]>(
    () => [
      { accessorKey: 'invoiceNumber', header: 'Invoice #' },
      {
        id: 'customer',
        header: 'Customer',
        cell: ({ row }) => row.original.customerName ?? 'Walk-in',
      },
      ...(canSeeAll
        ? [
            {
              id: 'orderBooker',
              header: 'Order Booker',
              cell: ({ row }: { row: { original: Sale } }) => row.original.orderBookerName ?? '—',
            } satisfies ColumnDef<Sale>,
          ]
        : []),
      {
        accessorKey: 'saleDate',
        header: 'Date',
        cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString(),
      },
      {
        id: 'items',
        header: 'Items',
        cell: ({ row }) => row.original.items.length,
      },
      {
        accessorKey: 'grandTotal',
        header: 'Total',
        cell: ({ getValue }) => (getValue() as number).toFixed(2),
      },
      {
        accessorKey: 'paymentStatus',
        header: 'Payment',
        cell: ({ row, getValue }) => {
          const status = getValue() as PaymentStatus;
          return (
            <div className="flex items-center gap-1.5">
              <Badge variant={paymentVariant[status]}>{status}</Badge>
              {row.original.returnStatus === ReturnStatus.PARTIAL && <Badge variant="warning">Partially returned</Badge>}
              {row.original.returnStatus === ReturnStatus.FULL && <Badge variant="secondary">Fully returned</Badge>}
            </div>
          );
        },
      },
    ],
    [canSeeAll],
  );

  return (
    <PageAccessGuard requires="sales:read">
      <PageHeader
        title="Sales"
        description="Invoices sold to customers"
        actions={
          <div className="flex items-center gap-3">
            <Button
              onClick={() =>
                router.push('/sales/new')
              }
              disabled={!has('sales:create')}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Sale
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load sales</span>
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ComboboxWithCreate
          options={customerOptions}
          value={customerId}
          onChange={setCustomerId}
          placeholder="All customers"
          searchPlaceholder="Search customers..."
          emptyMessage="No customers found."
          className="w-52"
        />
        {canSeeAll && (
          <Select value={orderBookerId} onValueChange={setOrderBookerId}>
            <SelectTrigger className="w-48" aria-label="Order Booker">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Order Bookers</SelectItem>
              {orderBookers.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={paymentStatus} onValueChange={setPaymentStatus}>
          <SelectTrigger className="w-40" aria-label="Payment status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All payments</SelectItem>
            {Object.values(PaymentStatus).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={returnStatus} onValueChange={setReturnStatus}>
          <SelectTrigger className="w-56" aria-label="Return status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All returns</SelectItem>
            <SelectItem value="ANY">Any return (partial or full)</SelectItem>
            <SelectItem value={ReturnStatus.PARTIAL}>Partially returned</SelectItem>
            <SelectItem value={ReturnStatus.FULL}>Fully returned</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          From
          <Input type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          To
          <Input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </label>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          Rows per page
          <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
            <SelectTrigger className="w-20" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : total === 0 && !hasFilters ? (
        <EmptyState icon={Receipt} title="No sales yet" description="Create your first invoice to a customer" />
      ) : (
        <DataTable
          columns={columns}
          data={sales}
          searchPlaceholder="Search by Invoice #..."
          emptyMessage="No sales match the current filters."
          search={{ value: searchInput, onChange: setSearchInput }}
          pagination={{
            pageIndex,
            pageSize,
            total,
            onPageChange: setPageIndex,
            onPageSizeChange: setPageSize,
          }}
          onRowClick={(row) => setDetailSale(row)}
        />
      )}

      <Suspense fallback={null}>
        <OpenFromUrl onOpen={setOpenId} />
      </Suspense>

      {detailSale && (
        <SaleDetailDialog
          key={detailSale.id}
          open={detailSale !== null}
          onOpenChange={(open) => !open && setDetailSale(null)}
          sale={detailSale}
          branchId={selectedBranchId}
        />
      )}
    </PageAccessGuard>
  );
}
