import { receiptAmountsError } from './cash-receipt-amounts';

describe('receiptAmountsError', () => {
  it('accepts a payment up to the balance, with or without a difference', () => {
    expect(receiptAmountsError(45, 0, 45)).toBeNull();
    expect(receiptAmountsError(40, 5, 45)).toBeNull(); // 40 received + 5 written off settles 45
    expect(receiptAmountsError(30, 0, 45)).toBeNull();
  });

  it('rejects amount plus difference above the balance', () => {
    expect(receiptAmountsError(40, 6, 45)).toBe('Amount plus difference exceeds the balance of 45.00');
    expect(receiptAmountsError(46, 0, 45)).toBe('Amount exceeds the balance of 45.00');
  });

  it('allows a cent of rounding slack, not more', () => {
    expect(receiptAmountsError(45.01, 0, 45)).toBeNull();
    expect(receiptAmountsError(45.02, 0, 45)).not.toBeNull();
  });

  it('rejects a negative difference', () => {
    expect(receiptAmountsError(10, -1, 45)).toBe('Difference must be 0 or more');
  });

  it('handles floating point sums', () => {
    expect(receiptAmountsError(0.1, 0.2, 0.3)).toBeNull();
  });
});
