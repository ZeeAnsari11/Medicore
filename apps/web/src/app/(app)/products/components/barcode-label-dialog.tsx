'use client';

import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  AlertDescription,
} from '@medicore/ui';
import type { Product } from '@medicore/shared-types';

interface BarcodeLabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
}

type BarcodeFormat = 'CODE128' | 'EAN13';

/** Pure check so the error message is a derived render value, not effect-set state. */
function validateBarcodeValue(value: string, format: BarcodeFormat): string | null {
  if (format === 'EAN13' && !/^\d{12,13}$/.test(value)) {
    return 'EAN-13 needs a 12 or 13 digit numeric barcode — this value doesn\'t qualify. Use Code 128 instead, or set a numeric barcode on the product.';
  }
  return null;
}

export function BarcodeLabelDialog({ open, onOpenChange, product }: BarcodeLabelDialogProps) {
  const [format, setFormat] = useState<BarcodeFormat>('CODE128');
  const [quantity, setQuantity] = useState(1);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  const barcodeValue = product?.barcode?.trim() || product?.id || '';
  const usingFallback = !product?.barcode?.trim();
  const error = barcodeValue ? validateBarcodeValue(barcodeValue, format) : null;

  useEffect(() => {
    if (!open || !barcodeValue || error) return;
    for (const canvas of canvasRefs.current.slice(0, quantity)) {
      if (!canvas) continue;
      JsBarcode(canvas, barcodeValue, {
        format,
        displayValue: true,
        fontSize: 12,
        width: 2,
        height: 50,
        margin: 4,
      });
    }
  }, [open, barcodeValue, format, quantity, error]);

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Print barcode labels — {product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {usingFallback && (
            <Alert>
              <AlertDescription>
                This product has no barcode set — labels will encode its internal product ID instead.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as BarcodeFormat)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CODE128">Code 128</SelectItem>
                  <SelectItem value="EAN13">EAN-13 (12 digits)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Number of labels</Label>
              <Input
                type="number"
                integer
                min={1}
                max={100}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              />
            </div>
          </div>
        </div>

        <div
          data-print-area="true"
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border p-4 print:grid-cols-4 print:gap-2 print:border-0 print:p-0"
        >
          {Array.from({ length: quantity }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1 rounded border p-2 text-center print:break-inside-avoid"
            >
              <span className="text-xs font-medium">{product.name}</span>
              <canvas
                ref={(el) => {
                  canvasRefs.current[i] = el;
                }}
              />
              <span className="text-xs text-muted-foreground">{product.tp.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => window.print()} disabled={!!error}>
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
