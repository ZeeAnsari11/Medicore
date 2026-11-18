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
import { usePurchase, usePurchasesPage } from '@/hooks/use-purchases';
import { OpenFromUrl } from '@/components/open-from-url';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useVendors } from '@/hooks/use-vendors';
import { useBranches } from '@/hooks/use-branches';
import { usePermissions } from '@/hooks/use-permissions';
import { PaymentStatus, PurchaseStatus, ReturnStatus } from '@medicore/shared-types';
import { PurchaseDetailDialog } from './components/purchase-detail-dialog';
import type { Purchase } from '@medicore/shared-types';

const ALL = '__all__';
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500];

const paymentVariant: Record<PaymentStatus, 'default' | 'secondary' | 'warning'> = {
  PAID: 'default',
  PARTIAL: 'warning',
  UNPAID: 'secondary',
};

export default function PurchasesPage() {
  const router = useRouter();
  const { has } = usePermissions();
  const { vendors } = useVendors();
  const { branches } = useBranches();

  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [detailPurchase, setDetailPurchase] = useState<Purchase | null>(null);
  // Opened from a link elsewhere (?open=<id>), e.g. a ledger row.
  const [openId, setOpenId] = useState<string | null>(null);
  const { purchase: linkedPurchase } = usePurchase(openId, selectedBranchId);
  useEffect(() => {
    if (linkedPurchase) {
      setDetailPurchase(linkedPurchase);
      setOpenId(null);
    }
  }, [linkedPurchase]);

  const [vendorId, setVendorId] = useState(ALL);
  const [paymentStatus, setPaymentStatus] = useState(ALL);
  const [returnStatus, setReturnStatus] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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
  }, [selectedBranchId, vendorId, paymentStatus, returnStatus, status, dateFrom, dateTo, search, pageSize]);

  const { purchases, total, isLoading, error } = usePurchasesPage({
    branchId: selectedBranchId,
    vendorId: vendorId === ALL ? undefined : vendorId,
    paymentStatus: paymentStatus === ALL ? undefined : paymentStatus,
    returnStatus: returnStatus === ALL ? undefined : returnStatus,
    status: status === ALL ? undefined : status,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: search || undefined,
    page: pageIndex + 1,
    limit: pageSize,
  });

  const vendorOptions = useMemo(
    () => [{ value: ALL, label: 'All vendors' }, ...vendors.map((v) => ({ value: v.id, label: v.company }))],
    [vendors],
  );

  const hasFilters = vendorId !== ALL || paymentStatus !== ALL || returnStatus !== ALL || status !== ALL || !!dateFrom || !!dateTo || !!search;
  const clearFilters = () => {
    setVendorId(ALL);
    setPaymentStatus(ALL);
    setReturnStatus(ALL);
    setStatus(ALL);
    setDateFrom('');
    setDateTo('');
    setSearchInput('');
  };


  const columns = useMemo<ColumnDef<Purchase>[]>(
    () => [
      { accessorKey: 'purchaseNumber', header: 'PO #' },
      {
        id: 'vendor',
        header: 'Vendor',
        cell: ({ row }) => row.original.vendorName ?? '—',
      },
      {
        id: 'branch',
        header: 'Branch',
        cell: ({ row }) => branches.find((b) => b.id === row.original.branchId)?.name ?? '—',
      },
      {
        accessorKey: 'purchaseDate',
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
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue() as PurchaseStatus;
          return <Badge variant={status === PurchaseStatus.CANCELLED ? 'destructive' : 'default'}>{status}</Badge>;
        },
      },
    ],
    [branches],
  );

  return (
    <PageAccessGuard requires="purchases:read">
      <PageHeader
        title="Purchases"
        description="Stock received from vendors"
        actions={
          <div className="flex items-center gap-3">
            <Button
              onClick={() =>
                router.push('/purchases/new')
              }
              disabled={!has('purchases:create')}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Purchase
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load purchases</span>
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ComboboxWithCreate
          options={vendorOptions}
          value={vendorId}
          onChange={setVendorId}
          placeholder="All vendors"
          searchPlaceholder="Search vendors..."
          emptyMessage="No vendors found."
          className="w-52"
        />
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {Object.values(PurchaseStatus).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          From
          <Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          To
          <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
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
        <Button
          disabled={!(hasFilters)} variant="outline" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : total === 0 && !hasFilters ? (
        <EmptyState icon={Receipt} title="No purchases yet" description="Receive your first purchase from a vendor" />
      ) : (
        <DataTable
          columns={columns}
          data={purchases}
          searchPlaceholder="Search by PO #..."
          emptyMessage="No purchases match the current filters."
          search={{ value: searchInput, onChange: setSearchInput }}
          hideClearFilters
          pagination={{
            pageIndex,
            pageSize,
            total,
            onPageChange: setPageIndex,
            onPageSizeChange: setPageSize,
          }}
          onRowClick={(row) => setDetailPurchase(row)}
        />
      )}

      <Suspense fallback={null}>
        <OpenFromUrl onOpen={setOpenId} />
      </Suspense>

      {detailPurchase && (
        <PurchaseDetailDialog
          key={detailPurchase.id}
          open={detailPurchase !== null}
          onOpenChange={(open) => !open && setDetailPurchase(null)}
          purchase={detailPurchase}
          branchId={selectedBranchId}
        />
      )}
    </PageAccessGuard>
  );
}
