'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ColumnDef,
} from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { OpenFromUrl } from '@/components/open-from-url';
import { usePayment, usePayments } from '@/hooks/use-payments';
import { InvoiceType, PartyType } from '@medicore/shared-types';
import type { Payment } from '@medicore/shared-types';
import { PaymentDialog } from './components/payment-dialog';
import { PaymentDetailDialog } from './components/payment-detail-dialog';

const ALL_TYPES = '__all__';

export default function PaymentsPage() {
  const router = useRouter();
  const { has } = usePermissions();

  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [partyTypeFilter, setPartyTypeFilter] = useState<PartyType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);
  const [detail, setDetail] = useState<Payment | null>(null);
  // Opened from a link elsewhere (?open=<paymentId>), e.g. a ledger row.
  const [openId, setOpenId] = useState<string | null>(null);
  const { payment: linkedPayment } = usePayment(openId, selectedBranchId);
  useEffect(() => {
    if (linkedPayment) {
      setDetail(linkedPayment);
      setOpenId(null);
    }
  }, [linkedPayment]);

  const { payments, isLoading, error, voidPayment, isVoiding } = usePayments(selectedBranchId, partyTypeFilter ?? undefined);
  const canVoid = has('acc_payments:void');


  const columns = useMemo<ColumnDef<Payment>[]>(
    () => [
      {
        accessorKey: 'paymentNumber',
        header: 'Payment ID',
        // Numeric, so 10 sorts after 9 rather than after 1.
        sortingFn: (a, b) => Number(a.original.paymentNumber ?? 0) - Number(b.original.paymentNumber ?? 0),
      },
      { accessorKey: 'paymentDate', header: 'Date', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
      {
        accessorKey: 'partyType',
        header: 'Party Type',
        cell: ({ getValue }) => <Badge variant="outline">{getValue() as string}</Badge>,
      },
      { accessorKey: 'partyName', header: 'Party' },
      { accessorKey: 'amount', header: 'Amount', cell: ({ getValue }) => (getValue() as number).toFixed(2) },
      { accessorKey: 'method', header: 'Method' },
      { accessorKey: 'accountName', header: 'Account' },
      {
        // The invoice(s) this payment settled; also what searching for an invoice number matches.
        id: 'invoices',
        header: 'Invoice(s)',
        accessorFn: (p) => p.allocations.map((a) => a.invoiceNumber ?? '').filter(Boolean).join(', '),
        cell: ({ row }) =>
          row.original.allocations.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="flex flex-wrap gap-x-2">
              {row.original.allocations.map((a) => (
                <Link
                  key={a.invoiceId}
                  href={a.invoiceType === InvoiceType.SALE ? `/sales?open=${a.invoiceId}` : `/purchases?open=${a.invoiceId}`}
                  className="text-primary hover:underline"
                >
                  {a.invoiceNumber ?? a.invoiceId}
                </Link>
              ))}
            </span>
          ),
      },
      {
        // The cash receipt it came from (T-0001), else the typed reference.
        accessorKey: 'displayReference',
        header: 'Reference',
        cell: ({ row }) =>
          row.original.receipt?.transactionNumber ? (
            <Link
              href={`/sales/cash-receipt?transaction=${encodeURIComponent(row.original.receipt.transactionNumber)}`}
              className="text-primary hover:underline"
            >
              {row.original.displayReference}
            </Link>
          ) : (
            (row.original.displayReference ?? '')
          ),
      },
      {
        accessorKey: 'unallocatedAmount',
        header: 'Advance/Unallocated',
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return v > 0.01 ? <Badge variant="secondary">{v.toFixed(2)}</Badge> : <span className="text-muted-foreground">—</span>;
        },
      },
      {
        id: 'void',
        header: '',
        cell: ({ row }) =>
          canVoid ? (
            <Button variant="ghost" size="sm" onClick={() => setVoidTarget(row.original)}>
              Void
            </Button>
          ) : null,
      },
    ],
    [canVoid],
  );

  return (
    <PageAccessGuard requires="acc_payments:read">
      <button onClick={() => router.push('/accounting')} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Accounting
      </button>

      <PageHeader
        title="Payments"
        description="Every customer and vendor payment, with allocations and advances."
        actions={
          <div className="flex items-center gap-3">
            <Select
              value={partyTypeFilter ?? ALL_TYPES}
              onValueChange={(v) => setPartyTypeFilter(v === ALL_TYPES ? null : (v as PartyType))}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>All parties</SelectItem>
                <SelectItem value={PartyType.CUSTOMER}>Customers</SelectItem>
                <SelectItem value={PartyType.VENDOR}>Vendors</SelectItem>
              </SelectContent>
            </Select>
            <Button disabled={!has('acc_payments:create')} onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Record Payment
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load payments</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={payments}
          searchPlaceholder="Search payments..."
          filtersActive={partyTypeFilter !== null}
          onClearFilters={() => setPartyTypeFilter(null)}
          onRowClick={(row) => setDetail(row)}
        />
      )}

      <Dialog open={voidTarget !== null} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this payment?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {voidTarget ? `${voidTarget.amount.toFixed(2)} from ${voidTarget.partyName ?? 'this party'}` : ''} will be
            reversed in the ledger and taken off the invoice(s) it paid. An invoice with no other payment becomes
            editable again.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>
              Keep payment
            </Button>
            <Button
              variant="destructive"
              disabled={isVoiding}
              onClick={async () => {
                if (!voidTarget) return;
                try {
                  await voidPayment(voidTarget.id);
                } finally {
                  setVoidTarget(null);
                }
              }}
            >
              {isVoiding ? 'Voiding...' : 'Void payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Suspense fallback={null}>
        <OpenFromUrl onOpen={setOpenId} />
      </Suspense>

      <PaymentDetailDialog payment={detail} onOpenChange={(open) => !open && setDetail(null)} />

      <PaymentDialog open={dialogOpen} branchId={selectedBranchId} onOpenChange={setDialogOpen} />
    </PageAccessGuard>
  );
}
