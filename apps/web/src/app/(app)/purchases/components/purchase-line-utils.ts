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
}

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
