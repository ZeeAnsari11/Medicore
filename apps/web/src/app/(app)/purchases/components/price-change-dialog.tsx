'use client';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@medicore/ui';
import { formatRs } from '@/components/last-price-hint';
import type { PurchasePriceUpdateRequest } from '@medicore/shared-types';

export interface PriceChangeRow {
  productId: string;
  name: string;
  /** The vendor's current linked price. */
  oldPrice: number;
  newPrice: number;
}

interface PriceChangeDialogProps {
  rows: PriceChangeRow[];
  isSaving: boolean;
  onConfirm: (updates: PurchasePriceUpdateRequest[]) => void;
  onCancel: () => void;
}

export function PriceChangeDialog({ rows, isSaving, onConfirm, onCancel }: PriceChangeDialogProps) {
  const submit = (updatePrices: boolean) =>
    onConfirm(rows.map((r) => ({ productId: r.productId, updatePrices })));

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Purchase price decreased</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.productId} className="space-y-1 rounded border p-3 text-sm">
              <p className="font-medium">{r.name}</p>
              <p className="text-muted-foreground">
                Vendor price: {formatRs(r.oldPrice)} → {formatRs(r.newPrice)}
              </p>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={() => submit(false)} disabled={isSaving}>
            Save without updating prices
          </Button>
          <Button type="button" onClick={() => submit(true)} disabled={isSaving}>
            Approve &amp; save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
