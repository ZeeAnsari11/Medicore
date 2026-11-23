'use client';

import { useMemo, useState } from 'react';
import { ReturnCondition, ReturnReasonCode, ReturnSettlementMode, PaymentMethod } from '@medicore/shared-types';
import type { Purchase, PurchaseReturn, Sale, SaleReturn } from '@medicore/shared-types';
import { useCreateDocumentReturn } from '@/hooks/use-returns';

export interface ReturnRow {
  key: string;
  productId: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  original: number;
  returned: number;
  returnable: number;
  /** What one returned unit is worth on the ORIGINAL line (discount and tax included). */
  unitAmount: number;
  /** The free units given on this batch: returned in the same row, but worth nothing. */
  bonusOriginal: number;
  bonusReturned: number;
  bonusReturnable: number;
}

export const REASON_LABELS: Record<ReturnReasonCode, string> = {
  [ReturnReasonCode.DAMAGED]: 'Damaged',
  [ReturnReasonCode.EXPIRED]: 'Expired',
  [ReturnReasonCode.WRONG_ITEM]: 'Wrong item',
  [ReturnReasonCode.EXCESS]: 'Excess',
  [ReturnReasonCode.OTHER]: 'Other',
};

export const CONDITION_LABELS: Record<ReturnCondition, string> = {
  [ReturnCondition.RESTOCK]: 'Restock',
  [ReturnCondition.DAMAGED]: 'Damaged',
  [ReturnCondition.EXPIRED]: 'Expired',
};

const round2 = (v: number) => Math.round(v * 100) / 100;

type Doc = { kind: 'purchase'; doc: Purchase; returns: PurchaseReturn[] } | { kind: 'sale'; doc: Sale; returns: SaleReturn[] };

/** Selection state and settlement math behind the inline "Return items" mode of the detail modals. */
export function useReturnMode(input: Doc, branchId: string | null) {
  const { kind, doc, returns } = input;
  const { create, isCreating } = useCreateDocumentReturn(kind, doc.id, branchId);

  const [active, setActive] = useState(false);
  // A key present means the row is ticked; null while its qty box is being retyped (empty).
  const [qty, setQty] = useState<Record<string, number | null>>({});
  // Free units to take back per ticked row; editable, so the bonus can stay with the customer.
  const [bonusQty, setBonusQty] = useState<Record<string, number | null>>({});
  const [condition, setCondition] = useState<Record<string, ReturnCondition>>({});
  const [reasonCode, setReasonCode] = useState<ReturnReasonCode>(ReturnReasonCode.OTHER);
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<ReturnSettlementMode>(ReturnSettlementMode.ADJUST);
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH);

  const rows = useMemo<ReturnRow[]>(() => {
    const returnedByBatch = new Map<string, number>();
    for (const ret of returns) {
      if (kind === 'purchase') {
        for (const i of (ret as PurchaseReturn).items) {
          returnedByBatch.set(i.batchId, (returnedByBatch.get(i.batchId) ?? 0) + i.quantity);
        }
      } else {
        for (const i of (ret as SaleReturn).items) {
          for (const a of i.batchAllocations) {
            returnedByBatch.set(a.batchId, (returnedByBatch.get(a.batchId) ?? 0) + a.quantity);
          }
          for (const a of i.bonusAllocations ?? []) {
            const key = `bonus:${a.batchId}`;
            returnedByBatch.set(key, (returnedByBatch.get(key) ?? 0) + a.quantity);
          }
        }
      }
    }
    const out: ReturnRow[] = [];
    if (kind === 'purchase') {
      for (const item of (doc as Purchase).items) {
        if (!item.batchId) continue;
        const returned = returnedByBatch.get(item.batchId) ?? 0;
        out.push({
          key: item.batchId,
          productId: item.productId,
          productName: item.productName ?? item.productId,
          batchId: item.batchId,
          batchNumber: item.batchNumber,
          original: item.quantity,
          returned,
          // Units already sold or moved out of the batch cannot go back to the vendor.
          returnable: Math.max(round2(Math.min(item.quantity - returned, item.inStockQuantity ?? Infinity)), 0),
          unitAmount: item.lineTotal / item.quantity,
          bonusOriginal: 0,
          bonusReturned: 0,
          bonusReturnable: 0,
        });
      }
    } else {
      for (const item of (doc as Sale).items) {
        const unit = item.unitPrice * (1 - (item.discountPercent ?? 0) / 100) * (1 + (item.taxPercent ?? 0) / 100);
        // One row per batch, carrying both the paid and the free units of that batch.
        const batches = new Map<string, { batchNumber: string; paid: number; free: number }>();
        for (const a of item.batchAllocations) batches.set(a.batchId, { batchNumber: a.batchNumber, paid: a.quantity, free: 0 });
        for (const a of item.bonusAllocations ?? []) {
          const b = batches.get(a.batchId) ?? { batchNumber: a.batchNumber, paid: 0, free: 0 };
          batches.set(a.batchId, { ...b, free: a.quantity });
        }
        for (const [batchId, b] of batches) {
          const returned = returnedByBatch.get(batchId) ?? 0;
          const bonusReturned = returnedByBatch.get(`bonus:${batchId}`) ?? 0;
          out.push({
            key: batchId,
            productId: item.productId,
            productName: item.productName,
            batchId,
            batchNumber: b.batchNumber,
            original: b.paid,
            returned,
            returnable: Math.max(round2(b.paid - returned), 0),
            unitAmount: unit,
            bonusOriginal: b.free,
            bonusReturned,
            bonusReturnable: Math.max(round2(b.free - bonusReturned), 0),
          });
        }
      }
    }
    return out;
  }, [kind, doc, returns]);

  const selectable = rows.filter((r) => r.returnable > 0 || r.bonusReturnable > 0);
  const qtyOf = (r: ReturnRow) => qty[r.key] ?? 0;
  const ticked = (r: ReturnRow) => r.key in qty;
  const qtyInput = (r: ReturnRow) => qty[r.key] ?? '';
  const bonusOf = (r: ReturnRow) => bonusQty[r.key] ?? 0;
  const bonusInput = (r: ReturnRow) => bonusQty[r.key] ?? '';

  const allFull = selectable.length > 0 && selectable.every((r) => qtyOf(r) === r.returnable && bonusOf(r) === r.bonusReturnable);
  const headerState: boolean | 'indeterminate' = allFull
    ? true
    : selectable.some(ticked)
      ? 'indeterminate'
      : false;

  const reset = () => {
    setQty({});
    setBonusQty({});
    setCondition({});
    setReasonCode(ReturnReasonCode.OTHER);
    setNotes('');
    setMode(ReturnSettlementMode.ADJUST);
    setMethod(PaymentMethod.CASH);
  };

  const toggle = (r: ReturnRow) => {
    const next = { ...qty };
    const nextBonus = { ...bonusQty };
    if (ticked(r)) {
      delete next[r.key];
      delete nextBonus[r.key];
    } else {
      next[r.key] = r.returnable;
      nextBonus[r.key] = r.bonusReturnable;
    }
    setQty(next);
    setBonusQty(nextBonus);
  };
  // Clearing the box keeps the row ticked; an empty or zero qty is flagged as invalid instead.
  const setRowQty = (r: ReturnRow, raw: string) => {
    const n = Number(raw);
    setQty({ ...qty, [r.key]: raw === '' || !Number.isFinite(n) ? null : n });
  };
  const setRowBonus = (r: ReturnRow, raw: string) => {
    const n = Number(raw);
    setBonusQty({ ...bonusQty, [r.key]: raw === '' || !Number.isFinite(n) ? null : n });
  };
  const toggleAll = () => {
    setQty(allFull ? {} : Object.fromEntries(selectable.map((r) => [r.key, r.returnable])));
    setBonusQty(allFull ? {} : Object.fromEntries(selectable.map((r) => [r.key, r.bonusReturnable])));
  };

  const amountOf = (r: ReturnRow) => round2(qtyOf(r) * r.unitAmount);
  const returnTotal = round2(rows.reduce((sum, r) => sum + qtyOf(r) * r.unitAmount, 0));
  const returnedTotal = doc.returnedTotal ?? 0;
  const refundedTotal = doc.refundedTotal ?? 0;
  const outstanding = Math.max(round2(doc.grandTotal - returnedTotal - (doc.amountPaid - refundedTotal)), 0);
  const applied = Math.min(returnTotal, outstanding);
  const excess = round2(returnTotal - applied);
  const refund = mode === ReturnSettlementMode.REFUND ? excess : 0;
  const credit = round2(excess - refund);

  // A row may return only free units (paid qty 0), but never nothing at all.
  const invalid = rows.some(
    (r) =>
      ticked(r) &&
      (qty[r.key] === null ||
        bonusQty[r.key] === null ||
        qtyOf(r) < 0 ||
        qtyOf(r) > r.returnable + 0.0001 ||
        bonusOf(r) < 0 ||
        bonusOf(r) > r.bonusReturnable + 0.0001 ||
        qtyOf(r) + bonusOf(r) <= 0),
  );
  const canConfirm = rows.some(ticked) && !invalid && !isCreating;

  const submit = async (chosen: ReturnRow[], qtyOf: (r: ReturnRow) => number, bonusOf: (r: ReturnRow) => number) => {
    const base = {
      branchId: doc.branchId,
      reasonCode,
      reason: REASON_LABELS[reasonCode],
      notes: notes.trim() || undefined,
      settlement: refund > 0 ? { mode, method } : { mode: ReturnSettlementMode.ADJUST },
    };
    if (kind === 'purchase') {
      await create({
        ...base,
        items: chosen.filter((r) => qtyOf(r) > 0).map((r) => ({ productId: r.productId, batchId: r.batchId, quantity: qtyOf(r) })),
      });
    } else {
      const toAllocation = (r: ReturnRow, quantity: number) => ({
        batchId: r.batchId,
        quantity,
        condition: condition[r.key] ?? ReturnCondition.RESTOCK,
      });
      const byProduct = new Map<string, ReturnRow[]>();
      for (const r of chosen) byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r]);
      await create({
        ...base,
        items: [...byProduct.entries()].map(([productId, list]) => ({
          productId,
          batchAllocations: list.filter((r) => qtyOf(r) > 0).map((r) => toAllocation(r, qtyOf(r))),
          bonusAllocations: list.some((r) => bonusOf(r) > 0)
            ? list.filter((r) => bonusOf(r) > 0).map((r) => toAllocation(r, bonusOf(r)))
            : undefined,
        })),
      });
    }
    reset();
    setActive(false);
  };

  const confirm = () => submit(rows.filter(ticked), qtyOf, bonusOf);

  /** Returns everything still returnable on the document in one go (default ADJUST settlement). */
  const fullReturn = () => submit(selectable, (r) => r.returnable, (r) => r.bonusReturnable);

  return {
    kind,
    active,
    start: () => setActive(true),
    cancel: () => {
      reset();
      setActive(false);
    },
    rows,
    qtyOf,
    qtyInput,
    bonusOf,
    bonusInput,
    setRowBonus,
    ticked,
    amountOf,
    toggle,
    setRowQty,
    toggleAll,
    headerState,
    condition,
    setCondition: (r: ReturnRow, c: ReturnCondition) => setCondition({ ...condition, [r.key]: c }),
    reasonCode,
    setReasonCode,
    notes,
    setNotes,
    mode,
    setMode,
    method,
    setMethod,
    summary: {
      returnTotal,
      newNet: round2(doc.grandTotal - returnedTotal - returnTotal),
      newPaid: round2(doc.amountPaid - refundedTotal - refund),
      newOutstanding: round2(outstanding - applied),
      applied,
      excess,
      refund,
      credit,
    },
    invalid,
    canConfirm,
    isCreating,
    confirm,
    fullReturn,
    canFullReturn: selectable.length > 0,
  };
}

export type ReturnMode = ReturnType<typeof useReturnMode>;
