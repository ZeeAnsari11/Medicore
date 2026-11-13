'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Button,
  ComboboxWithCreate,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { useProductBatches } from '@/hooks/use-inventory';
import { useLastSalePrices } from '@/hooks/use-sales';
import { LastPriceHint } from '@/components/last-price-hint';
import { ProductDialog } from '../../products/components/product-dialog';
import type { Product } from '@medicore/shared-types';
import {
  allocateAcrossBatches,
  eligibleBatches,
  lineTotal,
  restoreStock,
  usedByBatch,
  withRemainingStock,
  type SaleLine,
} from './sale-line-utils';

export interface EntryDraft {
  productId: string;
  batchId: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxPercent: string;
}

export const EMPTY_DRAFT: EntryDraft = {
  productId: '',
  batchId: '',
  quantity: '',
  unitPrice: '',
  discountPercent: '',
  taxPercent: '',
};

/** A committed line group loaded back into the entry row. */
export interface EditTarget {
  groupId: string;
  serial: number;
  draft: EntryDraft;
}

const IDS = {
  product: 'sale-entry-product',
  batch: 'sale-entry-batch',
  quantity: 'sale-entry-qty',
  unitPrice: 'sale-entry-price',
  discountPercent: 'sale-entry-disc',
  taxPercent: 'sale-entry-tax',
} as const;

const focusId = (id: string) => document.getElementById(id)?.focus();

let lineSeq = 0;

type EntryErrors = Partial<Record<'product' | 'quantity' | 'unitPrice' | 'discountPercent' | 'taxPercent', string>>;

interface SaleEntryRowProps {
  products: Product[];
  branchId: string | null;
  customerId?: string;
  /** Committed lines; their quantities are held back from the stock the entry row can use. */
  lines: SaleLine[];
  /** The parent remounts this row (via key) when editing starts or ends, so it only seeds state from it. */
  editing: EditTarget | null;
  onCommit: (lines: SaleLine[], replaceGroupId: string | null) => void;
  onCancelEdit: () => void;
  /** Editing an existing sale: its original allocations, which count as available stock again. */
  restoreByBatch?: Map<string, number>;
}

export function SaleEntryRow({
  products,
  branchId,
  customerId,
  lines,
  editing,
  onCommit,
  onCancelEdit,
  restoreByBatch,
}: SaleEntryRowProps) {
  const [draft, setDraft] = useState<EntryDraft>(editing?.draft ?? EMPTY_DRAFT);
  // A price the user typed (or loaded from an edited line) is never overwritten by auto-fill.
  const [priceTouched, setPriceTouched] = useState(!!editing);
  const [attempted, setAttempted] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  // After a product is picked focus moves to Batch (or Qty when there is no stock to choose from),
  // and after a batch is picked on to Qty.
  const focusBatchPending = useRef(false);
  const focusQtyAfterBatch = useRef(false);
  const [pickToken, setPickToken] = useState(0);

  const product = products.find((p) => p.id === draft.productId);
  const { batches, isLoading: batchesLoading } = useProductBatches(draft.productId || null, branchId);
  const available = useMemo(
    () => withRemainingStock(eligibleBatches(restoreStock(batches, restoreByBatch)), usedByBatch(lines, editing?.groupId)),
    [batches, restoreByBatch, lines, editing?.groupId],
  );
  const totalAvailable = available.reduce((sum, b) => sum + b.quantity, 0);
  // Falls back to the nearest-expiry batch until the user picks one (or the picked one runs out).
  const batchId = available.some((b) => b.id === draft.batchId) ? draft.batchId : (available[0]?.id ?? '');

  const lastPrices = useLastSalePrices(customerId || null, draft.productId ? [draft.productId] : [], branchId);
  const lastPrice = lastPrices.get(draft.productId);

  const priceFor = () => {
    if (lastPrice?.price != null) return lastPrice.price;
    return product?.tp ?? 0;
  };

  useEffect(() => focusId(editing ? IDS.quantity : IDS.product), [editing]);

  // Batches load after the pick, so wait for them before deciding where focus goes.
  useEffect(() => {
    if (!focusBatchPending.current || !draft.productId || batchesLoading) return;
    focusBatchPending.current = false;
    const id = requestAnimationFrame(() => focusId(available.length > 0 ? IDS.batch : IDS.quantity));
    return () => cancelAnimationFrame(id);
  }, [pickToken, draft.productId, batchesLoading, available.length]);

  // Auto-filled until the user types a price.
  const unitPrice = priceTouched || !draft.productId ? draft.unitPrice : String(priceFor());

  // We never sell below CP; the discounted price is what counts.
  const minPrice = product?.cp ?? 0;
  const netPrice = (Number(unitPrice) || 0) * (1 - (Number(draft.discountPercent) || 0) / 100);
  const belowFloor = !!product && unitPrice !== '' && Math.round(netPrice * 100) < Math.round(minPrice * 100);
  const floorMessage = `Price after discount (${netPrice.toFixed(2)}) is below the cost price ${minPrice.toFixed(2)}`;


  const errors = useMemo<EntryErrors>(() => {
    const e: EntryErrors = {};
    const qty = Number(draft.quantity);
    if (!draft.productId) e.product = 'Select a product';
    if (!draft.quantity || !(qty > 0)) e.quantity = 'Qty must be greater than 0';
    else if (draft.productId && !batchesLoading) {
      if (available.length === 0) e.quantity = 'No stock available';
      else if (qty > totalAvailable) e.quantity = `Only ${totalAvailable} in stock`;
    }
    const price = Number(unitPrice);
    if (unitPrice === '' || !(price >= 0)) e.unitPrice = 'Price must be 0 or more';
    else if (belowFloor) e.unitPrice = floorMessage;
    for (const field of ['discountPercent', 'taxPercent'] as const) {
      const n = Number(draft[field]);
      if (draft[field] !== '' && !(n >= 0 && n <= 100)) {
        e[field] = `${field === 'discountPercent' ? 'Disc' : 'Tax'} % must be 0-100`;
      }
    }
    return e;
  }, [draft, unitPrice, available.length, totalAvailable, batchesLoading, belowFloor, floorMessage]);

  const set = (patch: Partial<EntryDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const applyProduct = (productId: string) => {
    set({ productId, batchId: '', unitPrice: '' });
    setPriceTouched(false);
  };

  const clear = () => {
    setDraft(EMPTY_DRAFT);
    setPriceTouched(false);
    setAttempted(false);
    if (editing) onCancelEdit();
    requestAnimationFrame(() => focusId(IDS.product));
  };

  const commit = () => {
    setAttempted(true);
    if (Object.keys(errors).length > 0) return;
    const { allocations, unmet } = allocateAcrossBatches(available, batchId, Number(draft.quantity));
    if (unmet > 0 || allocations.length === 0) return;

    const groupId = editing?.groupId ?? `group-${++lineSeq}`;
    const enteredPrice = Number(unitPrice);
    const keepTypedPrice = priceTouched || lastPrice?.price != null;
    const newLines: SaleLine[] = allocations.map(({ batch, quantity }, i) => ({
      key: `${groupId}-${i}-${++lineSeq}`,
      groupId,
      productId: draft.productId,
      productName: product?.name ?? '',
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      quantity,
      unitPrice: i === 0 || keepTypedPrice ? enteredPrice : priceFor(),
      discountPercent: draft.discountPercent === '' ? undefined : Number(draft.discountPercent),
      taxPercent: draft.taxPercent === '' ? undefined : Number(draft.taxPercent),
    }));

    onCommit(newLines, editing?.groupId ?? null);
    setDraft(EMPTY_DRAFT);
    setPriceTouched(false);
    setAttempted(false);
    requestAnimationFrame(() => focusId(IDS.product));
  };

  const onEnter = (next: string | 'commit') => (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!draft.productId) return focusId(IDS.product);
    if (next === 'commit') commit();
    else focusId(next);
  };

  const preview = lineTotal({
    quantity: Number(draft.quantity) || 0,
    unitPrice: Number(unitPrice) || 0,
    discountPercent: Number(draft.discountPercent) || 0,
    taxPercent: Number(draft.taxPercent) || 0,
  });
  const messages = Object.values(errors);
  const invalid = (field: keyof EntryErrors) => attempted && !!errors[field];

  return (
    <div
      role="group"
      aria-label="New line item"
      className="border-b bg-muted/40 p-3"
      onKeyDown={(e) => {
        // Only keys from the row itself; Esc inside the portaled product/batch popovers just closes them.
        if (e.key === 'Escape' && e.currentTarget.contains(e.target as Node)) {
          e.preventDefault();
          clear();
        }
      }}
    >
      {editing && (
        <p className="mb-2 text-xs text-primary">
          Editing line {editing.serial}. Press Enter on Tax % to update, Esc to cancel.
        </p>
      )}
      <div className="grid grid-cols-6 items-start gap-2 lg:grid-cols-[2.5rem_minmax(12rem,2fr)_minmax(9rem,1.4fr)_5rem_6rem_5rem_5rem_6rem_auto]">
        <div className="col-span-1 space-y-1 lg:col-span-1">
          <Label className="text-xs text-muted-foreground">Ser #</Label>
          <div className="flex h-9 items-center text-sm tabular-nums text-muted-foreground">
            {editing?.serial ?? lines.length + 1}
          </div>
        </div>

        <div className="col-span-5 space-y-1 lg:col-span-1">
          <Label className="text-xs text-muted-foreground">Product</Label>
          <ComboboxWithCreate
            id={IDS.product}
            value={draft.productId}
            onChange={(id) => {
              applyProduct(id);
              focusBatchPending.current = true;
              setPickToken((t) => t + 1);
            }}
            onCloseAutoFocus={(e) => {
              // The effect above moves focus on; don't let the popover hand it back to the trigger.
              if (focusBatchPending.current) e.preventDefault();
            }}
            options={products.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Search product"
            onCreateNew={() => setProductDialogOpen(true)}
            createLabel={() => 'Create new product'}
            className={`h-9 text-sm ${invalid('product') ? 'border-destructive' : ''}`}
          />
        </div>

        <div className="col-span-6 space-y-1 lg:col-span-1">
          <Label className="text-xs text-muted-foreground">Batch #</Label>
          <Select
            value={batchId}
            onValueChange={(batchId) => {
              focusQtyAfterBatch.current = true;
              set({ batchId });
            }}
            disabled={available.length === 0}
          >
            <SelectTrigger id={IDS.batch} className="h-9 w-full text-sm">
              <SelectValue placeholder="Auto (FEFO)" />
            </SelectTrigger>
            <SelectContent
              onCloseAutoFocus={(e) => {
                if (!focusQtyAfterBatch.current) return;
                focusQtyAfterBatch.current = false;
                e.preventDefault();
                focusId(IDS.quantity);
              }}
            >
              {available.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.batchNumber} · exp {new Date(b.expiryDate).toLocaleDateString()} · {b.quantity}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-3 space-y-1 lg:col-span-1">
          <Label htmlFor={IDS.quantity} className="text-xs text-muted-foreground">Qty</Label>
          <Input
            id={IDS.quantity}
            type="number"
            min={0}
            className="h-9 text-sm"
            aria-invalid={invalid('quantity')}
            value={draft.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
            onKeyDown={onEnter(IDS.unitPrice)}
          />
          {draft.productId && !batchesLoading && (
            <p className="text-[11px] leading-tight text-muted-foreground">In stock: {totalAvailable}</p>
          )}
        </div>

        <div className="col-span-3 space-y-1 lg:col-span-1">
          <Label htmlFor={IDS.unitPrice} className="text-xs text-muted-foreground">Unit price</Label>
          <Input
            id={IDS.unitPrice}
            type="number"
            step="0.01"
            min={0}
            className="h-9 text-sm"
            aria-invalid={invalid('unitPrice')}
            value={unitPrice}
            onChange={(e) => {
              setPriceTouched(true);
              set({ unitPrice: e.target.value });
            }}
            onKeyDown={onEnter(IDS.discountPercent)}
          />
          {belowFloor && <p className="text-xs text-destructive">{floorMessage}</p>}
          <LastPriceHint
            label="Last sold to this customer"
            last={lastPrice}
            current={Number(unitPrice) || 0}
            higherIsGood
          />
        </div>

        <div className="col-span-3 space-y-1 lg:col-span-1">
          <Label htmlFor={IDS.discountPercent} className="text-xs text-muted-foreground">Disc %</Label>
          <Input
            id={IDS.discountPercent}
            type="number"
            step="0.01"
            min={0}
            className="h-9 text-sm"
            aria-invalid={invalid('discountPercent')}
            value={draft.discountPercent}
            onChange={(e) => set({ discountPercent: e.target.value })}
            onKeyDown={onEnter(IDS.taxPercent)}
          />
        </div>

        <div className="col-span-3 space-y-1 lg:col-span-1">
          <Label htmlFor={IDS.taxPercent} className="text-xs text-muted-foreground">Tax %</Label>
          <Input
            id={IDS.taxPercent}
            type="number"
            step="0.01"
            min={0}
            className="h-9 text-sm"
            aria-invalid={invalid('taxPercent')}
            value={draft.taxPercent}
            onChange={(e) => set({ taxPercent: e.target.value })}
            onKeyDown={onEnter('commit')}
          />
        </div>

        <div className="col-span-4 space-y-1 lg:col-span-1">
          <Label className="text-xs text-muted-foreground">Total</Label>
          <div className="flex h-9 items-center text-sm font-medium tabular-nums">{preview.toFixed(2)}</div>
        </div>

        <div className="col-span-2 space-y-1 lg:col-span-1">
          <Label className="invisible text-xs">Add</Label>
          <Button type="button" size="sm" className="h-9" onClick={commit}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {editing ? 'Update' : 'Add'}
          </Button>
        </div>
      </div>

      {attempted && messages.length > 0 && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {messages.join(' · ')}
        </p>
      )}

      <ProductDialog
        open={productDialogOpen}
        mode="create"
        lockedBranchId={branchId ?? undefined}
        onOpenChange={setProductDialogOpen}
        onCreated={(created) => {
          applyProduct(created.id);
          focusBatchPending.current = true;
          setPickToken((t) => t + 1);
        }}
      />
    </div>
  );
}
