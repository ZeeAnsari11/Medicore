/** A committed purchase line. */
export interface PurchaseLine {
  key: string;
  productId: string;
  productName: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  discountPercent?: number;
  taxPercent?: number;
  /** Edit only: the batch this line sits on today, how many of its units are already sold or moved, and how many it had. */
  sourceBatchId?: string;
  sourceBatchNumber?: string;
  sourceQuantity?: number;
  soldQuantity?: number;
}

/** A line whose batch number was changed although some of its units are already sold: only the rest moves. */
export const isBatchMove = (l: PurchaseLine) =>
  !!l.sourceBatchId && (l.soldQuantity ?? 0) > 0 && l.batchNumber !== l.sourceBatchNumber;

export function lineTotal(
  line: Pick<PurchaseLine, 'quantity' | 'purchasePrice' | 'discountPercent' | 'taxPercent'>,
): number {
  const subtotal = (line.quantity || 0) * (line.purchasePrice || 0);
  const discount = subtotal * ((line.discountPercent || 0) / 100);
  const taxable = subtotal - discount;
  const tax = taxable * ((line.taxPercent || 0) / 100);
  return taxable + tax;
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
