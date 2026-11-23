'use client';

import Link from 'next/link';
import {
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@medicore/ui';
import { InvoiceType } from '@medicore/shared-types';
import type { Payment } from '@medicore/shared-types';

const money = (n: number) => n.toFixed(2);

/** Where an allocated invoice opens: its detail dialog on the Sales or Purchases page. */
const invoiceHref = (type: InvoiceType, id: string) => (type === InvoiceType.SALE ? `/sales?open=${id}` : `/purchases?open=${id}`);

/** Read-only view of one payment: who paid, into which account, which invoice(s) it settled and where it came from. */
export function PaymentDetailDialog({ payment, onOpenChange }: { payment: Payment | null; onOpenChange: (open: boolean) => void }) {
  const isCustomer = payment?.partyType === 'CUSTOMER';
  const fields: Array<[string, React.ReactNode]> = payment
    ? [
        ['Payment ID', payment.paymentNumber ?? '—'],
        [isCustomer ? 'Customer' : 'Vendor', payment.partyName ?? '—'],
        ['Date', new Date(payment.paymentDate).toLocaleDateString()],
        ['Amount', <span key="a" className="font-semibold tabular-nums">{money(payment.amount)}</span>],
        ['Method', payment.method],
        ['Account', payment.accountName ?? '—'],
        [
          'Cash receipt',
          payment.receipt?.transactionNumber ? (
            <Link
              key="r"
              href={`/sales/cash-receipt?transaction=${encodeURIComponent(payment.receipt.transactionNumber)}&readonly=1${payment.allocations[0] ? `&invoice=${payment.allocations[0].invoiceId}` : ''}`}
              className="text-primary hover:underline"
            >
              {payment.displayReference}
            </Link>
          ) : payment.receipt ? (
            payment.displayReference
          ) : (
            '—'
          ),
        ],
        ['Reference', payment.receipt ? '—' : payment.displayReference || '—'],
        ['Notes', payment.notes || '—'],
      ]
    : [];

  return (
    <Dialog open={payment !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Payment {payment ? new Date(payment.paymentDate).toLocaleDateString() : ''}</DialogTitle>
        </DialogHeader>
        {payment && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <h3 className="mb-2 text-sm font-medium">{isCustomer ? 'Applied to sale invoices' : 'Applied to purchases'}</h3>
              {payment.allocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not applied to an invoice: the whole amount is an advance.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{isCustomer ? 'Invoice #' : 'Purchase #'}</TableHead>
                        <TableHead className="text-right">Applied</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payment.allocations.map((a) => (
                        <TableRow key={a.invoiceId}>
                          <TableCell>
                            <Link href={invoiceHref(a.invoiceType, a.invoiceId)} className="text-primary hover:underline">
                              {a.invoiceNumber ?? a.invoiceId}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{money(a.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {payment.unallocatedAmount > 0.01 && (
                <p className="mt-2 text-sm">
                  <Badge variant="secondary">{money(payment.unallocatedAmount)}</Badge>{' '}
                  <span className="text-muted-foreground">is held as an advance, not yet applied to an invoice.</span>
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
