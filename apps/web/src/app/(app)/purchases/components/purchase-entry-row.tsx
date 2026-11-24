'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, ComboboxWithCreate, Input, Label } from '@medicore/ui';
import { useLastPurchasePrices } from '@/hooks/use-purchases';
import { LastPriceHint } from '@/components/last-price-hint';
import type { Product, VendorProduct } from '@medicore/shared-types';
import { lineTotal, todayIso, type PurchaseLine } from './purchase-line-utils';

export interface PurchaseEntryDraft {
  productId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: string;
  purchasePrice: string;
  sellingPrice: string;
  discountPercent: string;
  taxPercent: string;
}

const EMPTY_DRAFT: PurchaseEntryDraft = {
  productId: '',
  batchNumber: '',
  expiryDate: '',
  quantity: '',
  purchasePrice: '',
  sellingPrice: '',
  discountPercent: '',
  taxPercent: '',
};

/** A committed line loaded back into the entry row. */
export interface PurchaseEditTarget {
  key: string;
  serial: number;
  draft: PurchaseEntryDraft;
}

const IDS = {
  product: 'purchase-entry-product',
  batchNumber: 'purchase-entry-batch',
  expiryDate: 'purchase-entry-expiry',
  quantity: 'purchase-entry-qty',
  purchasePrice: 'purchase-entry-price',
  sellingPrice: 'purchase-entry-sale',
  discountPercent: 'purchase-entry-disc',
  taxPercent: 'purchase-entry-tax',
} as const;

const focusId = (id: string) => document.getElementById(id)?.focus();

let lineSeq = 0;

type EntryErrors = Partial<Record<keyof PurchaseEntryDraft, string>>;

interface PurchaseEntryRowProps {
  /** Only the selected vendor's products. */
  products: Product[];
  /** The selected vendor's product links, used to prefill this vendor's cost price. */
  vendorProducts: VendorProduct[];
  vendorId: string;
  branchId: string | null;
  serial: number;
  /** The parent remounts this row (via key) when editing starts or ends, so it only seeds state from it. */
  editing: PurchaseEditTarget | null;
  onCommit: (line: PurchaseLine, replaceKey: string | null) => void;
  onCancelEdit: () => void;
}

export function PurchaseEntryRow({
  products,
  vendorProducts,
  vendorId,
  branchId,
  serial,
  editing,
  onCommit,
  onCancelEdit,
}: PurchaseEntryRowProps) {
  const [draft, setDraft] = useState<PurchaseEntryDraft>(editing?.draft ?? EMPTY_DRAFT);
  const [attempted, setAttempted] = useState(false);
  const focusBatchOnClose = useRef(false);
  const vendorSelected = !!vendorId;

  const lastPrices = useLastPurchasePrices(vendorId || null, draft.productId ? [draft.productId] : [], branchId);
  const lastPrice = lastPrices.get(draft.productId);

  useEffect(() => focusId(editing ? IDS.quantity : IDS.product), [editing]);

  const set = (patch: Partial<PurchaseEntryDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const handleProduct = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    set({
      productId,
      purchasePrice: String(product?.cp ?? 0),
      sellingPrice: String(product?.tp ?? 0),
    });
    focusBatchOnClose.current = true;
  };

  const errors = useMemo<EntryErrors>(() => {
    const e: EntryErrors = {};
    if (!draft.productId) e.productId = 'Select a product';
    if (!draft.batchNumber.trim()) e.batchNumber = 'Batch # is required';
    if (!draft.expiryDate) e.expiryDate = 'Expiry is required';
    else if (draft.expiryDate < todayIso()) e.expiryDate = 'Expiry cannot be in the past';
    if (!(Number(draft.quantity) > 0)) e.quantity = 'Qty must be greater than 0';
    for (const field of ['purchasePrice', 'sellingPrice'] as const) {
      if (draft[field] === '' || !(Number(draft[field]) >= 0)) {
        e[field] = `${field === 'purchasePrice' ? 'Price' : 'Sale price'} must be 0 or more`;
      }
    }
    for (const field of ['discountPercent', 'taxPercent'] as const) {
      const n = Number(draft[field]);
      if (draft[field] !== '' && !(n >= 0 && n <= 100)) {
        e[field] = `${field === 'discountPercent' ? 'Disc' : 'Tax'} % must be 0-100`;
      }
    }
    return e;
  }, [draft]);

  const clear = () => {
    setDraft(EMPTY_DRAFT);
    setAttempted(false);
    if (editing) onCancelEdit();
    requestAnimationFrame(() => focusId(IDS.product));
  };

  const commit = () => {
    setAttempted(true);
    if (Object.keys(errors).length > 0) return;
    onCommit(
      {
        key: `purchase-line-${++lineSeq}`,
        productId: draft.productId,
        productName: products.find((p) => p.id === draft.productId)?.name ?? '',
        batchNumber: draft.batchNumber.trim(),
        expiryDate: draft.expiryDate,
        quantity: Number(draft.quantity),
        purchasePrice: Number(draft.purchasePrice),
        sellingPrice: Number(draft.sellingPrice),
        discountPercent: draft.discountPercent === '' ? undefined : Number(draft.discountPercent),
        taxPercent: draft.taxPercent === '' ? undefined : Number(draft.taxPercent),
      },
      editing?.key ?? null,
    );
    setDraft(EMPTY_DRAFT);
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
    purchasePrice: Number(draft.purchasePrice) || 0,
    discountPercent: Number(draft.discountPercent) || 0,
    taxPercent: Number(draft.taxPercent) || 0,
  });
  const messages = Object.values(errors);
  const invalid = (field: keyof EntryErrors) => attempted && !!errors[field];

  return (
    <div
      role="group"
      aria-label="New line item"
      className="@container border-b bg-muted/40 p-3"
      onKeyDown={(e) => {
        // Only keys from the row itself; Esc inside the portaled product popover just closes it.
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
      <div className="grid grid-cols-6 items-start gap-2 @min-[1040px]:grid-cols-[2.5rem_minmax(8rem,2fr)_6rem_8.5rem_4.5rem_5.5rem_5.5rem_4rem_4rem_5rem_auto]">
        <div className="col-span-1 space-y-1 @min-[1040px]:col-span-1">
          <Label className="text-xs text-muted-foreground">Ser #</Label>
          <div className="flex h-9 items-center text-sm tabular-nums text-muted-foreground">
            {editing?.serial ?? serial}
          </div>
        </div>

        <div className="col-span-5 space-y-1 @min-[1040px]:col-span-1">
          <Label className="text-xs text-muted-foreground">Product</Label>
          <ComboboxWithCreate
            id={IDS.product}
            value={draft.productId}
            onChange={handleProduct}
            onCloseAutoFocus={(e) => {
              if (!focusBatchOnClose.current) return;
              focusBatchOnClose.current = false;
              e.preventDefault();
              focusId(IDS.batchNumber);
            }}
            options={products.map((p) => ({ value: p.id, label: p.name, hint: p.genericName }))}
            hintSearchLabel="Search by generic name"
            placeholder={vendorSelected ? 'Search product' : 'Select a vendor first'}
            disabled={!vendorSelected}
            className={`h-9 text-sm ${invalid('productId') ? 'border-destructive' : ''}`}
          />
        </div>

        <div className="col-span-3 space-y-1 @min-[1040px]:col-span-1">
          <Label htmlFor={IDS.batchNumber} className="text-xs text-muted-foreground">Batch #</Label>
          <Input
            id={IDS.batchNumber}
            className="h-9 text-sm"
            aria-invalid={invalid('batchNumber')}
            value={draft.batchNumber}
            onChange={(e) => set({ batchNumber: e.target.value })}
            onKeyDown={onEnter(IDS.expiryDate)}
          />
        </div>

        <div className="col-span-3 space-y-1 @min-[1040px]:col-span-1">
          <Label htmlFor={IDS.expiryDate} className="text-xs text-muted-foreground">Expiry</Label>
          <Input
            id={IDS.expiryDate}
            type="date"
            min={todayIso()}
            className="h-9 text-sm"
            aria-invalid={invalid('expiryDate')}
            value={draft.expiryDate}
            onChange={(e) => set({ expiryDate: e.target.value })}
            onKeyDown={onEnter(IDS.quantity)}
          />
        </div>

        <div className="col-span-2 space-y-1 @min-[1040px]:col-span-1">
          <Label htmlFor={IDS.quantity} className="text-xs text-muted-foreground">Qty</Label>
          <Input
            id={IDS.quantity}
            type="number"
            min={0}
            className="h-9 text-sm"
            aria-invalid={invalid('quantity')}
            value={draft.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
            onKeyDown={onEnter(IDS.purchasePrice)}
          />
        </div>

        <div className="col-span-2 space-y-1 @min-[1040px]:col-span-1">
          <Label htmlFor={IDS.purchasePrice} className="text-xs text-muted-foreground">Price</Label>
          <Input
            id={IDS.purchasePrice}
            type="number"
            step="0.01"
            min={0}
            className="h-9 text-sm"
            aria-invalid={invalid('purchasePrice')}
            value={draft.purchasePrice}
            onChange={(e) => set({ purchasePrice: e.target.value })}
            onKeyDown={onEnter(IDS.sellingPrice)}
          />
          <LastPriceHint
            label="Last price"
            last={lastPrice}
            current={Number(draft.purchasePrice) || 0}
            higherIsGood={false}
            emptyText="First purchase"
            showNow
          />
        </div>

        <div className="col-span-2 space-y-1 @min-[1040px]:col-span-1">
          <Label htmlFor={IDS.sellingPrice} className="text-xs text-muted-foreground">Sale</Label>
          <Input
            id={IDS.sellingPrice}
            type="number"
            step="0.01"
            min={0}
            className="h-9 text-sm"
            aria-invalid={invalid('sellingPrice')}
            value={draft.sellingPrice}
            onChange={(e) => set({ sellingPrice: e.target.value })}
            onKeyDown={onEnter(IDS.discountPercent)}
          />
        </div>

        <div className="col-span-2 space-y-1 @min-[1040px]:col-span-1">
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

        <div className="col-span-2 space-y-1 @min-[1040px]:col-span-1">
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

        <div className="col-span-2 space-y-1 @min-[1040px]:col-span-1">
          <Label className="text-xs text-muted-foreground">Total</Label>
          <div className="flex h-9 items-center text-sm font-medium tabular-nums">{preview.toFixed(2)}</div>
        </div>

        <div className="col-span-6 space-y-1 @min-[1040px]:col-span-1">
          <Label className="invisible hidden text-xs @min-[1040px]:block">Add</Label>
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
    </div>
  );
}
