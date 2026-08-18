'use client';

import { useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
  Label,
} from '@medicore/ui';
import { usePurchases } from '@/hooks/use-purchases';
import { usePermissions } from '@/hooks/use-permissions';
import { PaymentStatus, PurchaseStatus } from '@medicore/shared-types';
import type { Purchase } from '@medicore/shared-types';

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

export function PurchaseDetailDialog({ open, onOpenChange, purchase, branchId }: PurchaseDetailDialogProps) {
  const { has } = usePermissions();
  const { updatePayment, isUpdatingPayment, cancel, isCancelling } = usePurchases(branchId);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(purchase?.paymentStatus ?? PaymentStatus.UNPAID);
  const [amountPaid, setAmountPaid] = useState<number>(purchase?.amountPaid ?? 0);

  if (!purchase) return null;

  const handleSavePayment = async () => {
    await updatePayment(purchase.id, { paymentStatus, amountPaid: Number(amountPaid) });
  };

  const handleCancel = async () => {
    if (confirm(`Cancel purchase ${purchase.purchaseNumber}? This will reverse the stock it added.`)) {
      await cancel(purchase.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Qty</TableHead>
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
                    <TableCell>{item.purchasePrice.toFixed(2)}</TableCell>
                    <TableCell>{item.lineTotal.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{purchase.subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{purchase.discountTotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>+{purchase.taxTotal.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold border-t pt-1"><span>Grand total</span><span>{purchase.grandTotal.toFixed(2)}</span></div>
          </div>

          {purchase.status !== PurchaseStatus.CANCELLED && has('purchases:update') && (
            <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 bg-muted/30">
              <div className="space-y-1.5">
                <Label>Payment status</Label>
                <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as PaymentStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PaymentStatus.UNPAID}>Unpaid</SelectItem>
                    <SelectItem value={PaymentStatus.PARTIAL}>Partial</SelectItem>
                    <SelectItem value={PaymentStatus.PAID}>Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Amount paid</Label>
                <Input type="number" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(Number(e.target.value))} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {purchase.status !== PurchaseStatus.CANCELLED && has('purchases:delete') ? (
            <Button variant="destructive" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling ? 'Cancelling...' : 'Cancel purchase'}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            {purchase.status !== PurchaseStatus.CANCELLED && has('purchases:update') && (
              <Button onClick={handleSavePayment} disabled={isUpdatingPayment}>
                {isUpdatingPayment ? 'Saving...' : 'Save payment'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
