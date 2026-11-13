import type { Batch } from '@medicore/shared-types';

/** A committed sale line. Lines produced by one entry (split across batches) share a groupId. */
export interface SaleLine {
  key: string;
  groupId: string;
  productId: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
}

/** Batches that can still be sold: stock left and not expired, nearest expiry first. */
export function eligibleBatches(batches: Batch[]): Batch[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return batches
    .filter((b) => b.quantity > 0 && new Date(b.expiryDate) >= today)
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
}

export function lineTotal(line: Pick<SaleLine, 'quantity' | 'unitPrice' | 'discountPercent' | 'taxPercent'>): number {
  const subtotal = (line.quantity || 0) * (line.unitPrice || 0);
  const discount = subtotal * ((line.discountPercent || 0) / 100);
  const taxable = subtotal - discount;
  const tax = taxable * ((line.taxPercent || 0) / 100);
  return taxable + tax;
}

/** Quantity already committed per batch, optionally ignoring the group being edited. */
export function usedByBatch(lines: SaleLine[], excludeGroupId?: string | null): Map<string, number> {
  const used = new Map<string, number>();
  for (const line of lines) {
    if (line.groupId === excludeGroupId) continue;
    used.set(line.batchId, (used.get(line.batchId) ?? 0) + line.quantity);
  }
  return used;
}

/** Adds quantity back to batches (an edited sale's original allocations), before eligibility is judged. */
export function restoreStock(batches: Batch[], restore?: Map<string, number>): Batch[] {
  if (!restore || restore.size === 0) return batches;
  return batches.map((b) => ({ ...b, quantity: b.quantity + (restore.get(b.id) ?? 0) }));
}

/** Batches with committed quantity subtracted; fully used batches drop out. */
export function withRemainingStock(batches: Batch[], used: Map<string, number>): Batch[] {
  return batches
    .map((b) => ({ ...b, quantity: b.quantity - (used.get(b.id) ?? 0) }))
    .filter((b) => b.quantity > 0);
}

export interface Allocation {
  batch: Batch;
  quantity: number;
}

/**
 * Covers `quantity` starting at the chosen batch, then the later-expiry batches, then any earlier
 * ones. `unmet` is whatever no batch could cover.
 */
export function allocateAcrossBatches(
  available: Batch[],
  startBatchId: string,
  quantity: number,
): { allocations: Allocation[]; unmet: number } {
  const start = Math.max(
    available.findIndex((b) => b.id === startBatchId),
    0,
  );
  const ordered = [...available.slice(start), ...available.slice(0, start)];
  const allocations: Allocation[] = [];
  let remaining = quantity;
  for (const batch of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    allocations.push({ batch, quantity: take });
    remaining -= take;
  }
  return { allocations, unmet: Math.max(remaining, 0) };
}
