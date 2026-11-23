import { ConflictException } from '@nestjs/common';

/** What a purchase put into one batch, and how much of it is gone (sold, transferred or adjusted away). */
export interface OldBatchReceipt {
  productId: string;
  batchNumber: string;
  /** yyyy-mm-dd */
  expiry: string;
  qty: number;
  sold: number;
}

interface MovableLine {
  productId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  /** The batch the line sits on today; sent by the edit screens for lines loaded from the purchase. */
  sourceBatchId?: string;
}

/**
 * A line whose batch number was changed although part of its batch is already gone is split in two: the
 * units that left stay on the old batch (so sales, returns and cost keep pointing at it) and only the
 * units still in stock move to the new batch. Everything else passes through untouched, so the normal
 * edit rules (rename an untouched batch, refuse to drop a sold one, ...) still apply to it.
 */
export function splitMovedLines<T extends MovableLine>(items: T[], old: Map<string, OldBatchReceipt>): T[] {
  const used = new Set<string>();
  return items.flatMap((item) => {
    const src = item.sourceBatchId ? old.get(item.sourceBatchId) : undefined;
    if (
      !item.sourceBatchId ||
      !src ||
      used.has(item.sourceBatchId) ||
      src.productId !== item.productId ||
      src.batchNumber === item.batchNumber ||
      src.sold <= 0
    ) {
      return [item];
    }
    used.add(item.sourceBatchId);
    if (src.sold >= src.qty) {
      throw new ConflictException(
        `All ${src.qty} units of batch "${src.batchNumber}" are already sold or moved; there is nothing left to move to "${item.batchNumber}"`,
      );
    }
    if (item.quantity < src.sold) {
      throw new ConflictException(
        `${src.sold} of ${src.qty} units of batch "${src.batchNumber}" are already sold or moved, so the quantity cannot go below ${src.sold}`,
      );
    }
    const stayed: T = { ...item, batchNumber: src.batchNumber, expiryDate: src.expiry, quantity: src.sold };
    const moved: T = { ...item, quantity: item.quantity - src.sold };
    // A quantity equal to what was sold leaves nothing to put on the new batch.
    return moved.quantity > 0 ? [stayed, moved] : [stayed];
  });
}
