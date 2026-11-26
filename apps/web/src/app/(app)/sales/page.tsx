'use client';

import { toAfterFrom } from '@/lib/date-range';
import { customerOption } from '@/lib/party-label';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Download, FileText, Plus, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  ComboboxWithCreate,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ColumnDef,
  FilterPanel,
  CollapsibleSection,
} from '@medicore/ui';
import { salesReportPath, useOrderBookers, useSale, useSalesPage } from '@/hooks/use-sales';
import { useDocumentPdf } from '@/hooks/use-document-pdf';
import { OpenFromUrl } from '@/components/open-from-url';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useCustomers } from '@/hooks/use-customers';
import { usePermissions } from '@/hooks/use-permissions';
import { PaymentStatus, ReturnStatus, WALK_IN_CUSTOMER_ID } from '@medicore/shared-types';
import { SaleDetailDialog } from './components/sale-detail-dialog';
import { SupplyReportsDialog } from './components/supply-reports-dialog';
import type { Sale } from '@medicore/shared-types';

const ALL = '__all__';
// Marks a filter that is currently narrowing the list.
const ACTIVE = 'border-primary ring-1 ring-primary';
const active = (on: boolean) => (on ? ACTIVE : '');
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500];

const paymentVariant: Record<PaymentStatus, 'default' | 'secondary' | 'warning'> = {
  PAID: 'default',
  PARTIAL: 'warning',
  UNPAID: 'secondary',
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const netOf = (s: Sale) => round2(s.grandTotal - (s.returnedTotal ?? 0));
// Same formula as the sale detail dialog's outstanding amount.
const remainingOf = (s: Sale) => Math.max(round2(netOf(s) - (s.amountPaid - (s.refundedTotal ?? 0))), 0);

export default function SalesPage() {
  const router = useRouter();
  const { has } = usePermissions();
  const { customers } = useCustomers();

  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [detailSale, setDetailSale] = useState<Sale | null>(null);
  // Opened from a link elsewhere (?open=<id>), e.g. a ledger row.
  const [openId, setOpenId] = useState<string | null>(null);
  // From a ledger payment row (`readonly=1&payment=<id>`): the invoice opens view-only with that payment marked.
  const [linkMode, setLinkMode] = useState<{ paymentId: string | null } | null>(null);
  const openFromUrl = useCallback((id: string, params: URLSearchParams) => {
    setLinkMode(params.get('readonly') === '1' ? { paymentId: params.get('payment') } : null);
    setOpenId(id);
  }, []);
  const { sale: linkedSale } = useSale(openId, selectedBranchId);
  useEffect(() => {
    if (linkedSale) {
      setDetailSale(linkedSale);
      setOpenId(null);
    }
  }, [linkedSale]);
  const [supplyOpen, setSupplyOpen] = useState(false);
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

  const filterParams = {
    branchId: selectedBranchId,
    customerId: customerId === ALL ? undefined : customerId,
    orderBookerId: orderBookerId === ALL ? undefined : orderBookerId,
    paymentStatus: paymentStatus === ALL ? undefined : paymentStatus,
    returnStatus: returnStatus === ALL ? undefined : returnStatus,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    search: search || undefined,
  };
  const { sales, total, summary, isLoading, error } = useSalesPage({ ...filterParams, page: pageIndex + 1, limit: pageSize });
  const { openPdf, isOpening } = useDocumentPdf();

  const customerOptions = useMemo(
    () => [{ value: ALL, label: 'All customers' }, { value: WALK_IN_CUSTOMER_ID, label: 'Walk-in customers' }, ...customers.map(customerOption)],
    [customers],
  );

  // Only people who can see every sale get the filter and column; an Order Booker only has their own.
  const canSeeAll = has('sales:view_all');
  const { orderBookers } = useOrderBookers(selectedBranchId, canSeeAll);
  const hasFilters = customerId !== ALL || orderBookerId !== ALL || paymentStatus !== ALL || returnStatus !== ALL || !!startDate || !!endDate || !!search;
  const activeFilterCount = [customerId !== ALL, orderBookerId !== ALL, paymentStatus !== ALL, returnStatus !== ALL, !!startDate, !!endDate].filter(Boolean).length;
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
      { accessorKey: 'invoiceNumber', header: 'Inv #' },
      {
        accessorKey: 'saleDate',
        header: 'Date',
        cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString(),
      },
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
        accessorKey: 'grandTotal',
        header: 'Gross Sale',
        cell: ({ getValue }) => (getValue() as number).toFixed(2),
      },
      {
        id: 'saleReturn',
        header: 'Sale Return',
        cell: ({ row }) => (row.original.returnedTotal ?? 0).toFixed(2),
      },
      {
        id: 'netSale',
        header: 'Net Sale / Payable',
        cell: ({ row }) => netOf(row.original).toFixed(2),
      },
      {
        id: 'paid',
        header: 'Paid',
        cell: ({ row }) => row.original.amountPaid.toFixed(2),
      },
      {
        id: 'remaining',
        header: 'Remaining Bal',
        cell: ({ row }) => remainingOf(row.original).toFixed(2),
      },
      {
        accessorKey: 'paymentStatus',
        header: 'Payment Status',
        cell: ({ row, getValue }) => {
          const status = getValue() as PaymentStatus;
          return (
            <div className="flex items-center gap-1.5">
              <Badge variant={paymentVariant[status]}>{status}</Badge>
              {(row.original.advanceApplied ?? 0) > 0 && <Badge variant="secondary">Advance</Badge>}
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
        report={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Download Report
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={isOpening || total === 0}
                  onClick={() => void openPdf(salesReportPath({ ...filterParams, page: 1, limit: 1 }))}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Sales report (PDF)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSupplyOpen(true)}>
                  <FileText className="mr-2 h-4 w-4" />
                  Supply reports
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <SupplyReportsDialog open={supplyOpen} onOpenChange={setSupplyOpen} branchId={selectedBranchId} canPickBranch={branchFilter.showDropdown} canPickBookers={canSeeAll} />
          </>
        }
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
        <FilterPanel activeCount={activeFilterCount}>
          <ComboboxWithCreate
            options={customerOptions}
            value={customerId}
            onChange={setCustomerId}
            placeholder="All customers"
            searchPlaceholder="Search customers..."
            emptyMessage="No customers found."
            className={`w-52 ${active(customerId !== ALL)}`}
          />
          {canSeeAll && (
            <Select value={orderBookerId} onValueChange={setOrderBookerId}>
              <SelectTrigger className={`w-48 ${active(orderBookerId !== ALL)}`} aria-label="Order Booker">
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
            <SelectTrigger className={`w-40 ${active(paymentStatus !== ALL)}`} aria-label="Payment status">
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
            <SelectTrigger className={`w-56 ${active(returnStatus !== ALL)}`} aria-label="Return status">
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
            <Input type="date" value={startDate} max={endDate || undefined} onChange={(e) => { setStartDate(e.target.value); setEndDate(toAfterFrom(e.target.value, endDate)); }} className={`w-40 ${active(!!startDate)}`} />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            To
            <Input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={`w-40 ${active(!!endDate)}`} />
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
        </FilterPanel>
      </div>

      {summary && (
        <CollapsibleSection
          className="mb-4 rounded-lg border p-2 sm:contents"
          contentClassName="grid grid-cols-2 gap-2 sm:mb-4 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6"
          summary={
            <>
              <span className="font-medium">{summary.orders} orders</span>
              <span className="text-muted-foreground">
                {' · Net '}
                {summary.net.toFixed(2)}
                {' · Due '}
                {summary.remaining.toFixed(2)}
              </span>
            </>
          }
        >
          {[
            ['Orders', String(summary.orders)],
            ['Gross Sale', summary.gross.toFixed(2)],
            ['Sale Return', summary.returned.toFixed(2)],
            ['Net Sale / Payable', summary.net.toFixed(2)],
            ['Paid', summary.paid.toFixed(2)],
            ['Remaining Bal', summary.remaining.toFixed(2)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold">{value}</p>
            </div>
          ))}
        </CollapsibleSection>
      )}

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
          hideClearFilters
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
        <OpenFromUrl onOpen={openFromUrl} />
      </Suspense>

      {detailSale && (
        <SaleDetailDialog
          key={detailSale.id}
          open={detailSale !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDetailSale(null);
              setLinkMode(null);
            }
          }}
          readOnly={!!linkMode}
          highlightPaymentId={linkMode?.paymentId ?? null}
          sale={detailSale}
          branchId={selectedBranchId}
        />
      )}
    </PageAccessGuard>
  );
}
