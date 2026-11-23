const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** How a purchase's total is settled: on account (AP), from the vendor's advance, or in cash. */
export function splitPurchaseSettlement(
  grandTotal: number,
  amountPaid: number,
  advanceApplied = 0,
) {
  const apPortion = round2(Math.max(grandTotal - amountPaid, 0));
  const paid = round2(Math.min(amountPaid, grandTotal));
  const advancePortion = round2(Math.min(Math.max(advanceApplied, 0), paid));
  return { apPortion, advancePortion, cashPortion: round2(paid - advancePortion) };
}
