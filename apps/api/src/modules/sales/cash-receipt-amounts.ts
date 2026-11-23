const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Why a cash-receipt row's amounts can't be saved, or null. `amount` is the cash received; `difference` is what the
 * customer and the shop agreed to write off so the invoice is settled; together they can't exceed what is still owed.
 */
export function receiptAmountsError(amount: number, difference: number, balance: number): string | null {
  if (!(difference >= 0)) return 'Difference must be 0 or more';
  if (round2(amount + difference) > round2(balance) + 0.01) {
    return difference > 0
      ? `Amount plus difference exceeds the balance of ${round2(balance).toFixed(2)}`
      : `Amount exceeds the balance of ${round2(balance).toFixed(2)}`;
  }
  return null;
}
