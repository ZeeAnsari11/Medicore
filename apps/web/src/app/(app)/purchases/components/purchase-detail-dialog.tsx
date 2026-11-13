'use client';

import { useState } from 'react';
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
import { usePurchases, usePurchase, usePurchasePayments } from '@/hooks/use-purchases';
import { usePermissions } from '@/hooks/use-permissions';
import { useDocumentPdf } from '@/hooks/use-document-pdf';
import { PaymentMethod, PaymentStatus, PurchaseStatus, ReturnStatus } from '@medicore/shared-types';
import { ReturnTable } from '@/components/returns/return-table';
import { ReturnSummary } from '@/components/returns/return-summary';
import { useReturnMode } from '@/components/returns/use-return-mode';
import { FullReturnConfirm } from '@/components/returns/full-return-confirm';
import { ReturnsSection } from '@/components/returns/returns-section';
import { useDocumentReturns } from '@/hooks/use-returns';
import type { Purchase, PurchaseReturn } from '@medicore/shared-types';

interface PurchaseDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: Purchase | null;
  branchId: string | null;
}

const paymentVariant: Record<PaymentStatus, 'default' | 'secondary' | 'warning'> = {
  PAID: 'default',
  PARTIAL: 'warning',
  UNPAID: 'secondary',
};

const EMPTY_PURCHASE = { id: '', branchId: '', items: [], grandTotal: 0, amountPaid: 0 } as unknown as Purchase;

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

export function PurchaseDetailDialog({
  open,
  onOpenChange,
  purchase: initialPurchase,
  branchId,
}: PurchaseDetailDialogProps) {
  // Prefer the live record so amount paid / status refresh right after a payment.
  const { purchase: livePurchase } = usePurchase(initialPurchase?.id ?? null, branchId);
  const purchase = livePurchase ?? initialPurchase;
  const { payments } = usePurchasePayments(initialPurchase?.id ?? null, branchId);
  const { has } = usePermissions();
  const { updatePayment, isUpdatingPayment } = usePurchases(branchId);
  const { openPdf, isOpening } = useDocumentPdf();
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [paymentDay, setPaymentDay] = useState<string>(todayIso());
  const [reference, setReference] = useState('');
  const [confirmFullReturn, setConfirmFullReturn] = useState(false);
  const { returns } = useDocumentReturns<PurchaseReturn>('purchase', initialPurchase?.id ?? null, branchId);
  // Hooks run before the null guard below, so give the return mode an empty stand-in until a purchase loads.
  const ret = useReturnMode({ kind: 'purchase', doc: purchase ?? EMPTY_PURCHASE, returns }, branchId);

  if (!purchase) return null;

  const netTotal = round2(purchase.grandTotal - (purchase.returnedTotal ?? 0));
  const outstanding = Math.max(
    round2(netTotal - (purchase.amountPaid - (purchase.refundedTotal ?? 0))),
    0,
  );
  const returnedQty = (batchId?: string) =>
    batchId
      ? returns.reduce(
          (sum, r) => sum + r.items.filter((i) => i.batchId === batchId).reduce((s, i) => s + i.quantity, 0),
          0,
        )
      : 0;
  const router = useRouter();
  // Editable only while no payment or return exists; the server decides and says why when it is not.
  const canEdit = purchase.isEditable === true && has('purchases:update');
  const lockNote = purchase.isEditable === false ? purchase.lockReason : undefined;
  const canReturn =
    purchase.status !== PurchaseStatus.CANCELLED &&
    purchase.returnStatus !== ReturnStatus.FULL &&
    has('purchases:return');

  const handleSavePayment = async () => {
    if (paymentAmount <= 0 || paymentAmount > outstanding + 0.01) return;
    await updatePayment(purchase.id, {
      paymentStatus: purchase.paymentStatus,
      amountPaid: round2(purchase.amountPaid + paymentAmount),
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
    void openPdf(`/purchases/${purchase.id}/pdf${query}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent expandable className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{purchase.purchaseNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{purchase.vendorName ?? 'Vendor'}</span>
            <span>·</span>
            <span>{new Date(purchase.purchaseDate).toLocaleDateString()}</span>
            <Badge variant={purchase.status === PurchaseStatus.CANCELLED ? 'destructive' : 'default'}>
              {purchase.status}
            </Badge>
            <Badge variant={paymentVariant[purchase.paymentStatus]}>{purchase.paymentStatus}</Badge>
            {purchase.returnStatus === ReturnStatus.PARTIAL && <Badge variant="warning">Partially returned</Badge>}
            {purchase.returnStatus === ReturnStatus.FULL && <Badge variant="secondary">Fully returned</Badge>}
          </div>

          {ret.active ? (
            <ReturnTable ret={ret} />
          ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Returned</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchase.items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.productName ?? item.productId}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.batchNumber} · exp {new Date(item.expiryDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{returnedQty(item.batchId) || '—'}</TableCell>
                    <TableCell>{item.purchasePrice.toFixed(2)}</TableCell>
                    <TableCell>{item.lineTotal.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          )}
          {ret.active && <ReturnSummary ret={ret} />}

          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{purchase.subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{purchase.discountTotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>+{purchase.taxTotal.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold border-t pt-1"><span>Grand total</span><span>{purchase.grandTotal.toFixed(2)}</span></div>
            {(purchase.returnedTotal ?? 0) > 0 && (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Returned</span><span>-{(purchase.returnedTotal ?? 0).toFixed(2)}</span></div>
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
                      <TableRow key={payment.id}>
                        <TableCell className="text-sm">{new Date(payment.paymentDate).toLocaleString()}</TableCell>
                        <TableCell className="tabular-nums">{payment.isRefund ? '-' : ''}{payment.amount.toFixed(2)}</TableCell>
                        <TableCell className="text-sm">
                          {payment.isRefund ? `Refund${payment.method ? ` · ${METHOD_LABELS[payment.method]}` : ''}` : payment.isInitial ? 'Paid at purchase' : payment.method ? METHOD_LABELS[payment.method] : '—'}
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

          <ReturnsSection kind="purchase" docId={purchase.id} branchId={branchId} returns={returns} />

          {!ret.active && purchase.status !== PurchaseStatus.CANCELLED && has('purchases:return') && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total paid</span>
                <span>{purchase.amountPaid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>Outstanding</span>
                <span>{outstanding.toFixed(2)}</span>
              </div>
              {outstanding <= 0.01 ? (
                <p className="text-sm text-muted-foreground">This purchase is fully paid.</p>
              ) : (
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
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {canReturn && ret.canFullReturn ? (
            <Button variant="destructive" onClick={() => setConfirmFullReturn(true)}>
              Full Return
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            {canEdit && (
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  router.push(`/purchases/${purchase.id}/edit?branchId=${purchase.branchId}`);
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
              {isOpening ? 'Preparing...' : 'View PO PDF'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            {purchase.status !== PurchaseStatus.CANCELLED && has('purchases:record_payment') && outstanding > 0.01 && (
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
        documentNumber={purchase.purchaseNumber}
        isPending={ret.isCreating}
        onConfirm={async () => {
          await ret.fullReturn();
          setConfirmFullReturn(false);
        }}
      />
    </Dialog>
  );
}
