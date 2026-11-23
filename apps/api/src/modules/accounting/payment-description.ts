/**
 * The note saved with a payment. What the user typed always wins; otherwise a payment that is not (fully) tied to bills
 * says so, so the Payments list and the ledgers show that part of it is an advance.
 */
export function paymentNote(opts: {
  notes?: string;
  partyType: 'CUSTOMER' | 'VENDOR';
  /** Amount applied to invoices. */
  allocated: number;
  /** Amount left unapplied (held as an advance). */
  remainder: number;
}): string | undefined {
  const typed = opts.notes?.trim();
  if (typed) return typed;
  if (!(opts.remainder > 0.005)) return undefined;
  if (opts.allocated > 0.005) return `Includes advance of ${opts.remainder.toFixed(2)}`;
  return opts.partyType === 'CUSTOMER' ? 'Advance received' : 'Advance payment';
}
