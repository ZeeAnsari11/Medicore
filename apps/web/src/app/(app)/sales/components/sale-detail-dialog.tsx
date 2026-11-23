'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { useSales, useSale, useSalePayments, useOrderBookers, useReassignOrderBooker } from '@/hooks/use-sales';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useDocumentPdf } from '@/hooks/use-document-pdf';
import { PaymentMethod, PaymentStatus, ReturnStatus } from '@medicore/shared-types';
import type { Sale, SaleReturn } from '@medicore/shared-types';
import { ReturnTable } from '@/components/returns/return-table';
import { ReturnSummary } from '@/components/returns/return-summary';
import { useReturnMode } from '@/components/returns/use-return-mode';
import { FullReturnConfirm } from '@/components/returns/full-return-confirm';
import { ReturnsSection } from '@/components/returns/returns-section';
import { useDocumentReturns } from '@/hooks/use-returns';

interface SaleDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  branchId: string | null;
  /** Opened from the ledger: nothing can be changed (no payment, return, edit or reassign). */
  readOnly?: boolean;
  /** The payment to mark in the Payments table (a ledger payment row). */
  highlightPaymentId?: string | null;
}

const paymentVariant: Record<PaymentStatus, 'default' | 'secondary' | 'warning'> = {
  PAID: 'default',
  PARTIAL: 'warning',
  UNPAID: 'secondary',
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Cash',
  [PaymentMethod.CARD]: 'Card',
  [PaymentMethod.CREDIT]: 'Credit',
  [PaymentMethod.BANK_TRANSFER]: 'Bank transfer',
};

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** The chosen day, with the current time of day so same-day payments sort and display sensibly. */
function paymentDateTime(day: string): string {
  const now = new Date();
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}

export function SaleDetailDialog({ open, onOpenChange, sale: initialSale, branchId, readOnly = false, highlightPaymentId = null }: SaleDetailDialogProps) {
  // Prefer the live record so amount paid / status refresh right after a payment.
  const { sale: liveSale } = useSale(initialSale.id, branchId);
  const sale = liveSale ?? initialSale;
  const { payments } = useSalePayments(initialSale.id, branchId);
  const { has, isAdmin } = usePermissions();
  const { user } = useAuth();
  const { reassign, isReassigning } = useReassignOrderBooker(branchId);
  const [reassigning, setReassigning] = useState(false);
  const [newBookerId, setNewBookerId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  // Options are only needed once an admin opens the reassign form, for this sale's own branch.
  const { orderBookers } = useOrderBookers(sale.branchId, isAdmin && reassigning);
  const { updatePayment, isUpdatingPayment } = useSales(branchId);
  const { openPdf, isOpening } = useDocumentPdf();
  const netTotal = round2(sale.grandTotal - (sale.returnedTotal ?? 0));
  const outstanding = Math.max(round2(netTotal - (sale.amountPaid - (sale.refundedTotal ?? 0))), 0);
  // Written off at a cash receipt: counted in the paid total, but not money received.
  const differenceTotal = round2(payments.filter((p) => p.isDifference).reduce((s, p) => s + p.amount, 0));
  const { returns } = useDocumentReturns<SaleReturn>('sale', initialSale.id, branchId);
  const ret = useReturnMode({ kind: 'sale', doc: sale, returns }, branchId);
  const returnedQty = (batchIds: string[], free = false) =>
    returns.reduce(
      (sum, r) =>
        sum +
        r.items.reduce(
          (s, i) =>
            s +
            (free ? (i.bonusAllocations ?? []) : i.batchAllocations)
              .filter((a) => batchIds.includes(a.batchId))
              .reduce((t, a) => t + a.quantity, 0),
          0,
        ),
      0,
    );
  const router = useRouter();
  // Editable only while no payment or return exists; the server decides and says why when it is not.
  // ...and only by the sale's Order Booker or an admin.
  const canEdit = !readOnly && sale.isEditable === true && has('sales:update') && (isAdmin || sale.orderBookerId === user?.userId);
  const lockNote = !readOnly && sale.isEditable === false ? sale.lockReason : undefined;
  const canReturn = !readOnly && sale.returnStatus !== ReturnStatus.FULL && has('sales:return');

  // Bring the highlighted payment into view once the payments have loaded.
  useEffect(() => {
    if (highlightPaymentId && payments.length > 0) {
      const t = setTimeout(() => document.querySelector('.payment-highlight')?.scrollIntoView({ block: 'center' }), 50);
      return () => clearTimeout(t);
    }
  }, [highlightPaymentId, payments]);
  const [paymentAmount, setPaymentAmount] = useState<number>(outstanding);
  const [method, setMethod] = useState<PaymentMethod>(sale.paymentMethod ?? PaymentMethod.CASH);
  const [paymentDay, setPaymentDay] = useState<string>(todayIso());
  const [reference, setReference] = useState('');
  const [confirmFullReturn, setConfirmFullReturn] = useState(false);

  const handleSavePayment = async () => {
    if (paymentAmount <= 0 || paymentAmount > outstanding + 0.01) return;
    await updatePayment(sale.id, {
      paymentStatus: sale.paymentStatus,
      amountPaid: round2(sale.amountPaid + paymentAmount),
      method,
      paymentDate: paymentDateTime(paymentDay),
      reference: reference.trim() || undefined,
    });
    setPaymentAmount(0);
    setReference('');
    setPaymentDay(todayIso());
  };

  const invalidAmount = paymentAmount <= 0 || paymentAmount > outstanding + 0.01;

  const handleViewPdf = () => {
    const query = branchId ? `?branchId=${branchId}` : '';
    void openPdf(`/sales/${sale.id}/pdf${query}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent expandable className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sale.invoiceNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {readOnly && <p className="text-sm text-muted-foreground">Opened from the ledger. View only: nothing can be changed here.</p>}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{sale.customerName ?? 'Walk-in customer'}</span>
            <span>·</span>
            <span>{new Date(sale.saleDate).toLocaleDateString()}</span>
            <Badge variant="outline">{sale.paymentMethod}</Badge>
            <Badge variant={paymentVariant[sale.paymentStatus]}>{sale.paymentStatus}</Badge>
            {(sale.advanceApplied ?? 0) > 0 && <Badge variant="secondary">Paid from advance</Badge>}
            {sale.returnStatus === ReturnStatus.PARTIAL && <Badge variant="warning">Partially returned</Badge>}
            {sale.returnStatus === ReturnStatus.FULL && <Badge variant="secondary">Fully returned</Badge>}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              <span className="text-muted-foreground">Order Booker:</span>{' '}
              <span className="font-medium">{sale.orderBookerName ?? '—'}</span>
            </span>
            {isAdmin && !reassigning && !readOnly && (
              <Button variant="ghost" size="sm" onClick={() => setReassigning(true)}>
                Reassign
              </Button>
            )}
          </div>
          {isAdmin && reassigning && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
              <div className="w-52 space-y-1">
                <Label className="text-xs text-muted-foreground">New Order Booker</Label>
                <Select value={newBookerId} onValueChange={setNewBookerId}>
                  <SelectTrigger aria-label="New Order Booker">
                    <SelectValue placeholder="Select Order Booker" />
                  </SelectTrigger>
                  <SelectContent>
                    {orderBookers
                      .filter((o) => o.id !== sale.orderBookerId)
                      .map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[10rem] flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Reason (optional)</Label>
                <Input value={reassignReason} maxLength={300} onChange={(e) => setReassignReason(e.target.value)} />
              </div>
              <Button
                size="sm"
                disabled={!newBookerId || isReassigning}
                onClick={async () => {
                  try {
                    await reassign({ id: sale.id, dto: { orderBookerId: newBookerId, reason: reassignReason.trim() || undefined } });
                    setReassigning(false);
                    setNewBookerId('');
                    setReassignReason('');
                  } catch {
                    // The mutation already toasted the error; keep the form open.
                  }
                }}
              >
                {isReassigning ? 'Saving...' : 'Reassign'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setReassigning(false)}>
                Cancel
              </Button>
            </div>
          )}

          {ret.active ? (
            <ReturnTable ret={ret} />
          ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch #</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Bonus</TableHead>
                  <TableHead>Returned</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.batchAllocations
                        .map((a) =>
                          item.batchAllocations.length > 1 ? `${a.batchNumber} (${a.quantity})` : a.batchNumber,
                        )
                        .join(', ')}
                    </TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.bonusQuantity || '—'}</TableCell>
                    <TableCell>
                      {(() => {
                        const batchIds = [...item.batchAllocations, ...(item.bonusAllocations ?? [])].map((a) => a.batchId);
                        const paid = returnedQty(batchIds);
                        const free = returnedQty(batchIds, true);
                        return paid || free ? `${paid}${free ? ` (+${free} bonus)` : ''}` : '—';
                      })()}
                    </TableCell>
                    <TableCell>{item.unitPrice.toFixed(2)}</TableCell>
                    <TableCell>{item.lineTotal.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          )}
          {ret.active && <ReturnSummary ret={ret} />}

          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{sale.subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{sale.discountTotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>+{sale.taxTotal.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold border-t pt-1"><span>Grand total</span><span>{sale.grandTotal.toFixed(2)}</span></div>
            {(sale.returnedTotal ?? 0) > 0 && (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Returned</span><span>-{(sale.returnedTotal ?? 0).toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold"><span>Net total</span><span>{netTotal.toFixed(2)}</span></div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Payments</Label>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet</p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference #</TableHead>
                      <TableHead>Recorded by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow
                        key={payment.id}
                        className={
                          payment.id === highlightPaymentId
                            ? 'payment-highlight bg-primary/10 [&>td:first-child]:border-l-4 [&>td:first-child]:border-primary'
                            : undefined
                        }
                      >
                        <TableCell className="text-sm">{new Date(payment.paymentDate).toLocaleString()}</TableCell>
                        <TableCell className="tabular-nums">{payment.isRefund ? '-' : ''}{payment.amount.toFixed(2)}</TableCell>
                        <TableCell className="text-sm">
                          {payment.isRefund
                            ? `Refund${payment.method ? ` · ${METHOD_LABELS[payment.method]}` : ''}`
                            : payment.isDifference
                            ? (
                                <>
                                  Difference (Sales Difference)
                                  {payment.expenseId && (
                                    <>
                                      {' · '}
                                      <Link href={`/accounting/expenses?open=${payment.expenseId}`} className="text-primary hover:underline">
                                        Expense {payment.expenseNumber ?? ''}
                                      </Link>
                                    </>
                                  )}
                                </>
                              )
                            : payment.isAdvance
                            ? 'Paid from advance'
                            : payment.isInitial
                            ? `Paid at sale${payment.method ? ` · ${METHOD_LABELS[payment.method]}` : ''}`
                            : payment.method
                              ? METHOD_LABELS[payment.method]
                              : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{payment.reference ?? '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{payment.recordedBy ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <ReturnsSection kind="sale" docId={sale.id} branchId={branchId} returns={returns} />

          {!ret.active && has('sales:return') && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{differenceTotal > 0 ? 'Received' : 'Total paid'}</span>
                <span>{(sale.amountPaid - differenceTotal).toFixed(2)}</span>
              </div>
              {differenceTotal > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Difference (written off)</span>
                    <span>{differenceTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total settled</span>
                    <span>{sale.amountPaid.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm font-medium">
                <span>Outstanding</span>
                <span>{outstanding.toFixed(2)}</span>
              </div>
              {outstanding <= 0.01 ? (
                <p className="text-sm text-muted-foreground">This invoice is fully paid.</p>
              ) : readOnly ? null : (
                <div className="space-y-1.5">
                  <Label>Record a payment</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(Number(e.target.value))}
                    />
                    <Button type="button" variant="outline" onClick={() => setPaymentAmount(outstanding)}>
                      Full amount
                    </Button>
                  </div>
                  {paymentAmount > outstanding + 0.01 && (
                    <p className="text-xs text-destructive">Amount cannot exceed the outstanding {outstanding.toFixed(2)}.</p>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>Payment method *</Label>
                      <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={PaymentMethod.CASH}>Cash</SelectItem>
                          <SelectItem value={PaymentMethod.CARD}>Card</SelectItem>
                          <SelectItem value={PaymentMethod.BANK_TRANSFER}>Bank transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Date</Label>
                      <Input type="date" max={todayIso()} value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Reference # (optional)</Label>
                      <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {ret.active ? (
          <DialogFooter>
            <Button variant="outline" onClick={ret.cancel} disabled={ret.isCreating}>Cancel</Button>
            <Button onClick={ret.confirm} disabled={!ret.canConfirm}>
              {ret.isCreating ? 'Saving...' : 'Confirm return'}
            </Button>
          </DialogFooter>
        ) : (
        <>
        {lockNote && <p className="text-xs text-muted-foreground">Not editable: {lockNote}</p>}
        <DialogFooter className="flex flex-wrap items-center justify-between gap-2 sm:justify-between">
          {canReturn && ret.canFullReturn ? (
            <Button variant="destructive" onClick={() => setConfirmFullReturn(true)}>
              Full Return
            </Button>
          ) : <span />}
          <div className="flex flex-wrap justify-end gap-2">
            {canEdit && (
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  router.push(`/sales/${sale.id}/edit?branchId=${sale.branchId}`);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
            {canReturn && (
              <Button variant="outline" onClick={ret.start}>
                Return items
              </Button>
            )}
            <Button variant="outline" onClick={handleViewPdf} disabled={isOpening}>
              {isOpening ? 'Preparing...' : 'View invoice PDF'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            {!readOnly && has('sales:record_payment') && outstanding > 0.01 && (
              <Button onClick={handleSavePayment} disabled={isUpdatingPayment || invalidAmount || !paymentDay}>
                {isUpdatingPayment ? 'Saving...' : 'Record payment'}
              </Button>
            )}
          </div>
        </DialogFooter>
        </>
        )}
      </DialogContent>
      <FullReturnConfirm
        open={confirmFullReturn}
        onOpenChange={setConfirmFullReturn}
        documentNumber={sale.invoiceNumber}
        isPending={ret.isCreating}
        onConfirm={async () => {
          await ret.fullReturn();
          setConfirmFullReturn(false);
        }}
      />
    </Dialog>
  );
}
