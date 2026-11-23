'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@medicore/ui';
import { cn } from '@/lib/utils';
import { lineTotal, type PurchaseLine } from './purchase-line-utils';

interface PurchaseLinesListProps {
  lines: PurchaseLine[];
  editingKey: string | null;
  onEdit: (line: PurchaseLine) => void;
  onRemove: (key: string) => void;
}

export function PurchaseLinesList({ lines, editingKey, onEdit, onRemove }: PurchaseLinesListProps) {
  if (lines.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        No items added yet. Search a product above to begin.
      </p>
    );
  }

  return (
    <div className="max-h-[45vh] overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            <TableHead className="h-9 px-2 text-xs">Ser #</TableHead>
            <TableHead className="h-9 px-2 text-xs">Product</TableHead>
            <TableHead className="h-9 px-2 text-xs">Batch #</TableHead>
            <TableHead className="h-9 px-2 text-xs">Expiry</TableHead>
            <TableHead className="h-9 px-2 text-right text-xs">Qty</TableHead>
            <TableHead className="h-9 px-2 text-right text-xs">Price</TableHead>
            <TableHead className="h-9 px-2 text-right text-xs">Sale</TableHead>
            <TableHead className="h-9 px-2 text-right text-xs">Disc %</TableHead>
            <TableHead className="h-9 px-2 text-right text-xs">Tax %</TableHead>
            <TableHead className="h-9 px-2 text-right text-xs">Total</TableHead>
            <TableHead className="h-9 px-2 text-xs" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, index) => (
            <TableRow
              key={line.key}
              onClick={() => onEdit(line)}
              className={cn('cursor-pointer', line.key === editingKey && 'bg-accent')}
            >
              <TableCell className="px-2 text-xs text-muted-foreground">{index + 1}</TableCell>
              <TableCell className="px-2 text-sm">{line.productName}</TableCell>
              <TableCell className="px-2 text-sm">
                {line.batchNumber}
                {(line.soldQuantity ?? 0) > 0 && (
                  <span className="block text-xs text-muted-foreground">{line.soldQuantity} sold</span>
                )}
              </TableCell>
              <TableCell className="px-2 text-sm">{new Date(line.expiryDate).toLocaleDateString()}</TableCell>
              <TableCell className="px-2 text-right text-sm tabular-nums">{line.quantity}</TableCell>
              <TableCell className="px-2 text-right text-sm tabular-nums">{line.purchasePrice.toFixed(2)}</TableCell>
              <TableCell className="px-2 text-right text-sm tabular-nums">{line.sellingPrice.toFixed(2)}</TableCell>
              <TableCell className="px-2 text-right text-sm tabular-nums">{line.discountPercent ?? 0}</TableCell>
              <TableCell className="px-2 text-right text-sm tabular-nums">{line.taxPercent ?? 0}</TableCell>
              <TableCell className="px-2 text-right text-sm font-medium tabular-nums">
                {lineTotal(line).toFixed(2)}
              </TableCell>
              <TableCell className="whitespace-nowrap px-2 text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit line ${index + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(line);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete line ${index + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(line.key);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
