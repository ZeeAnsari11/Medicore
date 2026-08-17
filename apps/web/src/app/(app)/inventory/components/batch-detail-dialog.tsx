'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
} from '@medicore/ui';
import { useProductBatches } from '@/hooks/use-inventory';

interface BatchDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  productName?: string;
  branchId: string | null;
}

function daysUntil(dateIso: string): number {
  const diffMs = new Date(dateIso).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function expiryBadge(dateIso: string) {
  const days = daysUntil(dateIso);
  if (days < 0) return <Badge variant="destructive">Expired</Badge>;
  if (days <= 30) return <Badge variant="warning">{days}d left</Badge>;
  if (days <= 90) return <Badge variant="outline">{days}d left</Badge>;
  return <Badge variant="secondary">{days}d left</Badge>;
}

export function BatchDetailDialog({ open, onOpenChange, productId, productName, branchId }: BatchDetailDialogProps) {
  const { batches, isLoading } = useProductBatches(productId, branchId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{productName ? `Batches — ${productName}` : 'Batches'}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          </div>
        ) : batches.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No batches on hand at this branch.</p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch #</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Sale price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{new Date(batch.expiryDate).toLocaleDateString()}</span>
                        {expiryBadge(batch.expiryDate)}
                      </div>
                    </TableCell>
                    <TableCell>{batch.quantity}</TableCell>
                    <TableCell>{batch.sellingPrice?.toFixed(2) ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
