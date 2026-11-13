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
  const [qty, setQty] = useState<Record<string, number>>({});
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
          returnable: Math.max(round2(item.quantity - returned), 0),
          unitAmount: item.lineTotal / item.quantity,
        });
      }
    } else {
      for (const item of (doc as Sale).items) {
        const unit = item.unitPrice * (1 - (item.discountPercent ?? 0) / 100) * (1 + (item.taxPercent ?? 0) / 100);
        for (const a of item.batchAllocations) {
          const returned = returnedByBatch.get(a.batchId) ?? 0;
          out.push({
            key: a.batchId,
            productId: item.productId,
            productName: item.productName,
            batchId: a.batchId,
            batchNumber: a.batchNumber,
            original: a.quantity,
            returned,
            returnable: Math.max(round2(a.quantity - returned), 0),
            unitAmount: unit,
          });
        }
      }
    }
    return out;
  }, [kind, doc, returns]);

  const selectable = rows.filter((r) => r.returnable > 0);
  const qtyOf = (r: ReturnRow) => qty[r.key] ?? 0;
  const ticked = (r: ReturnRow) => qtyOf(r) > 0;

  const allFull = selectable.length > 0 && selectable.every((r) => qtyOf(r) === r.returnable);
  const headerState: boolean | 'indeterminate' = allFull
    ? true
    : selectable.some((r) => qtyOf(r) > 0)
      ? 'indeterminate'
      : false;

  const reset = () => {
    setQty({});
    setCondition({});
    setReasonCode(ReturnReasonCode.OTHER);
    setNotes('');
    setMode(ReturnSettlementMode.ADJUST);
    setMethod(PaymentMethod.CASH);
  };

  const toggle = (r: ReturnRow) => setQty({ ...qty, [r.key]: ticked(r) ? 0 : r.returnable });
  const setRowQty = (r: ReturnRow, n: number) =>
    setQty({ ...qty, [r.key]: Number.isFinite(n) ? n : 0 });
  const toggleAll = () =>
    setQty(allFull ? {} : Object.fromEntries(selectable.map((r) => [r.key, r.returnable])));

  const amountOf = (r: ReturnRow) => round2(qtyOf(r) * r.unitAmount);
  const returnTotal = round2(rows.reduce((sum, r) => sum + qtyOf(r) * r.unitAmount, 0));
  const returnedTotal = doc.returnedTotal ?? 0;
  const refundedTotal = doc.refundedTotal ?? 0;
  const outstanding = Math.max(round2(doc.grandTotal - returnedTotal - (doc.amountPaid - refundedTotal)), 0);
  const applied = Math.min(returnTotal, outstanding);
  const excess = round2(returnTotal - applied);
  const refund = mode === ReturnSettlementMode.REFUND ? excess : 0;
  const credit = round2(excess - refund);

  const invalid = rows.some((r) => qtyOf(r) !== 0 && (qtyOf(r) < 1 || qtyOf(r) > r.returnable + 0.0001));
  const canConfirm = rows.some(ticked) && !invalid && !isCreating;

  const submit = async (chosen: ReturnRow[], qtyOf: (r: ReturnRow) => number) => {
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
        items: chosen.map((r) => ({ productId: r.productId, batchId: r.batchId, quantity: qtyOf(r) })),
      });
    } else {
      const byProduct = new Map<string, ReturnRow[]>();
      for (const r of chosen) byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r]);
      await create({
        ...base,
        items: [...byProduct.entries()].map(([productId, list]) => ({
          productId,
          batchAllocations: list.map((r) => ({
            batchId: r.batchId,
            quantity: qtyOf(r),
            condition: condition[r.key] ?? ReturnCondition.RESTOCK,
          })),
        })),
      });
    }
    reset();
    setActive(false);
  };

  const confirm = () => submit(rows.filter(ticked), (r) => qty[r.key]);

  /** Returns everything still returnable on the document in one go (default ADJUST settlement). */
  const fullReturn = () => submit(selectable, (r) => r.returnable);

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
