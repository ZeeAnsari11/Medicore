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
import { useSales } from '@/hooks/use-sales';
import { usePermissions } from '@/hooks/use-permissions';
import { PaymentStatus } from '@medicore/shared-types';
import type { Sale } from '@medicore/shared-types';

interface SaleDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  branchId: string | null;
}

const paymentVariant: Record<PaymentStatus, 'default' | 'secondary' | 'warning'> = {
  PAID: 'default',
  PARTIAL: 'warning',
  UNPAID: 'secondary',
};

export function SaleDetailDialog({ open, onOpenChange, sale, branchId }: SaleDetailDialogProps) {
  const { has } = usePermissions();
  const { updatePayment, isUpdatingPayment, cancel, isCancelling } = useSales(branchId);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(sale.paymentStatus);
  const [amountPaid, setAmountPaid] = useState<number>(sale.amountPaid);

  const handleSavePayment = async () => {
    await updatePayment(sale.id, { paymentStatus, amountPaid: Number(amountPaid) });
  };

  const handleCancel = async () => {
    if (confirm(`Void invoice ${sale.invoiceNumber}? This will restore the stock it consumed.`)) {
      await cancel(sale.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sale.invoiceNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{sale.customerName ?? 'Walk-in customer'}</span>
            <span>·</span>
            <span>{new Date(sale.saleDate).toLocaleDateString()}</span>
            <Badge variant="outline">{sale.paymentMethod}</Badge>
            <Badge variant={paymentVariant[sale.paymentStatus]}>{sale.paymentStatus}</Badge>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batches drawn</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.batchAllocations.map((a) => `${a.batchNumber} (${a.quantity})`).join(', ')}
                    </TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.unitPrice.toFixed(2)}</TableCell>
                    <TableCell>{item.lineTotal.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{sale.subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{sale.discountTotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>+{sale.taxTotal.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold border-t pt-1"><span>Grand total</span><span>{sale.grandTotal.toFixed(2)}</span></div>
          </div>

          {has('sales:update') && (
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
          {has('sales:delete') ? (
            <Button variant="destructive" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling ? 'Voiding...' : 'Void invoice'}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            {has('sales:update') && (
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
