'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Plus } from 'lucide-react';
import { ReportButton } from '@/components/layout/report-button';
import { DateRangeFilter, StatCards, inDateRange } from '@/components/layout/stat-cards';
import { useShownRows } from '@/hooks/use-shown-rows';
import { PageHeader } from '@/components/layout/page-header';
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
  type ColumnDef,
} from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { OpenFromUrl } from '@/components/open-from-url';
import { usePayment, usePayments } from '@/hooks/use-payments';
import { InvoiceType, PartyType } from '@medicore/shared-types';
import type { Payment } from '@medicore/shared-types';
import { PaymentDialog } from './payment-dialog';
import { PaymentDetailDialog } from './payment-detail-dialog';

/** Sale Receipts (money in from customers) and Payments (money out to vendors) share this view; each has its own 1, 2, 3 ... ids. */
export function PartyPaymentsView({ partyType }: { partyType: PartyType }) {
  const isReceipts = partyType === PartyType.CUSTOMER;
  const noun = isReceipts ? 'receipt' : 'payment';
  const router = useRouter();
  const { has } = usePermissions();

  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);
  const [detail, setDetail] = useState<Payment | null>(null);
  // Opened from a link elsewhere (?open=<paymentId>), e.g. a ledger row.
  const [openId, setOpenId] = useState<string | null>(null);
  const { payment: linkedPayment } = usePayment(openId, selectedBranchId);
  useEffect(() => {
    if (linkedPayment) {
      if (linkedPayment.partyType !== partyType) {
        // A link to the other kind (an old bookmark): send it to the page that lists it.
        router.replace(`/accounting/${linkedPayment.partyType === PartyType.CUSTOMER ? 'receipts' : 'payments'}?open=${linkedPayment.id}`);
        return;
      }
      setDetail(linkedPayment);
      setOpenId(null);
    }
  }, [linkedPayment, partyType, router]);

  const { payments: allPayments, isLoading, error, voidPayment, isVoiding } = usePayments(selectedBranchId, partyType);
  const [range, setRange] = useState({ from: '', to: '' });
  const payments = useMemo(() => allPayments.filter((p) => inDateRange(p.paymentDate, range.from, range.to)), [allPayments, range]);
  const canVoid = has('acc_payments:void');

  // What is on screen (the date range applied), voided entries marked.
  const shown = useShownRows(payments);
  const reportRows = shown.rows.map((p) => ({
    [isReceipts ? 'Receipt ID' : 'Payment ID']: p.paymentNumber ?? '',
    Date: new Date(p.paymentDate).toLocaleDateString('en-CA'),
    [isReceipts ? 'Customer' : 'Vendor']: p.partyName ?? '',
    Amount: p.amount.toFixed(2),
    Method: p.method,
    Account: p.accountName ?? '',
    'Invoice(s)': p.allocations.map((a) => a.invoiceNumber ?? '').filter(Boolean).join(', '),
    Reference: p.displayReference ?? '',
    'Advance/Unallocated': (p.unallocatedAmount ?? 0).toFixed(2),
    Notes: p.notes ?? '',
    Status: p.deletedAt ? 'Voided' : 'Active',
  }));

  const totals = useMemo(() => {
    const live = shown.rows.filter((p) => !p.deletedAt);
    const sum = (f: (p: Payment) => number) => live.reduce((n, p) => n + f(p), 0);
    return {
      count: live.length,
      amount: sum((p) => p.amount),
      unapplied: sum((p) => p.unallocatedAmount ?? 0),
      difference: sum((p) => p.differenceAmount ?? 0),
    };
  }, [shown.rows]);


  const columns = useMemo<ColumnDef<Payment>[]>(
    () => [
      {
        accessorKey: 'paymentNumber',
        header: isReceipts ? 'Receipt ID' : 'Payment ID',
        // Numeric, so 10 sorts after 9 rather than after 1.
        sortingFn: (a, b) => Number(a.original.paymentNumber ?? 0) - Number(b.original.paymentNumber ?? 0),
        // A vendor payment made on a bulk sheet: its plain number opens that sheet (the PT- id is never shown).
        cell: ({ row }) =>
          !isReceipts && row.original.receipt?.transactionNumber ? (
            <Link
              href={`/sales/cash-receipt?transaction=${encodeURIComponent(row.original.receipt.transactionNumber)}&readonly=1${row.original.allocations[0] ? `&invoice=${row.original.allocations[0].invoiceId}` : ''}`}
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.paymentNumber}
            </Link>
          ) : (
            (row.original.paymentNumber ?? '')
          ),
      },
      { accessorKey: 'paymentDate', header: 'Date', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
      { accessorKey: 'partyName', header: isReceipts ? 'Customer' : 'Vendor' },
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
              href={`/sales/cash-receipt?transaction=${encodeURIComponent(row.original.receipt.transactionNumber)}&readonly=1${row.original.allocations[0] ? `&invoice=${row.original.allocations[0].invoiceId}` : ''}`}
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
        // What the payment was for; an advance says so even when no note was typed (payments from before notes defaulted).
        id: 'description',
        header: 'Description',
        accessorFn: (p) => p.notes || (p.unallocatedAmount > 0.01 ? (p.allocations.length > 0 ? `Includes advance of ${p.unallocatedAmount.toFixed(2)}` : p.partyType === 'CUSTOMER' ? 'Advance received' : 'Advance payment') : ''),
        cell: ({ getValue }) => {
          const text = getValue() as string;
          return text ? <span className="text-sm">{text}</span> : <span className="text-muted-foreground">—</span>;
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
    [canVoid, isReceipts],
  );

  return (
    <>

      <PageHeader
        back={{ href: '/accounting', label: 'Back to Accounting' }}
        title={isReceipts ? 'Sale Receipts' : 'Payments'}
        description={
          isReceipts
            ? 'Money received from customers against invoices, with allocations and advances.'
            : 'Money paid to vendors against purchases, with allocations and advances.'
        }
        actions={
          <>
            <ReportButton
              title={isReceipts ? 'Sale Receipts' : 'Payments'}
              subtitle={range.from || range.to ? `${range.from || 'start'} to ${range.to || 'today'}` : 'All dates'}
              summary={[
                [isReceipts ? 'Receipts' : 'Payments', totals.count],
                [isReceipts ? 'Total received' : 'Total paid', totals.amount.toFixed(2)],
                [isReceipts ? 'Applied to invoices' : 'Applied to bills', (totals.amount - totals.unapplied).toFixed(2)],
                [isReceipts ? 'Advance held' : 'Prepaid to vendors', totals.unapplied.toFixed(2)],
                ...(isReceipts ? ([['Written off', totals.difference.toFixed(2)]] as Array<[string, string]>) : []),
              ]}
              totalColumns={['Amount', 'Advance/Unallocated']}
              rows={reportRows}
            />
            <Button disabled={!has('acc_payments:create')} onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {isReceipts ? 'Record Receipt' : 'Record Payment'}
            </Button>
          </>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load {isReceipts ? 'sale receipts' : 'payments'}</span>
        </Alert>
      )}

      <DateRangeFilter from={range.from} to={range.to} onChange={setRange} />

      {!isLoading && (
        <StatCards
          items={[
            { title: isReceipts ? 'Receipts' : 'Payments', value: totals.count, count: true },
            { title: isReceipts ? 'Total received' : 'Total paid', value: totals.amount },
            { title: isReceipts ? 'Applied to invoices' : 'Applied to bills', value: totals.amount - totals.unapplied },
            { title: isReceipts ? 'Advance held' : 'Prepaid to vendors', value: totals.unapplied, hint: 'Not yet applied to an invoice' },
            ...(isReceipts ? [{ title: 'Written off', value: totals.difference, hint: 'Sales difference' }] : []),
          ]}
          note={`Voided entries are not counted.${range.from || range.to ? ' Totals follow the dates above.' : ''}`}
        />
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <DataTable
          onFilteredRowsChange={shown.onFilteredRowsChange}
          columns={columns}
          data={payments}
          searchPlaceholder={isReceipts ? 'Search receipts...' : 'Search payments...'}
          onRowClick={(row) => setDetail(row)}
        />
      )}

      <Dialog open={voidTarget !== null} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this {noun}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {voidTarget ? `${voidTarget.amount.toFixed(2)} from ${voidTarget.partyName ?? 'this party'}` : ''} will be
            reversed in the ledger and taken off the invoice(s) it paid. An invoice with no other payment becomes
            editable again.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>
              Keep {noun}
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
              {isVoiding ? 'Voiding...' : `Void ${noun}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Suspense fallback={null}>
        <OpenFromUrl onOpen={setOpenId} />
      </Suspense>

      <PaymentDetailDialog payment={detail} onOpenChange={(open) => !open && setDetail(null)} />

      <PaymentDialog partyType={partyType} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
