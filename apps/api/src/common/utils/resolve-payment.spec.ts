import { PaymentStatus } from '@medicore/shared-types';
import { resolvePayment } from './resolve-payment';

describe('resolvePayment', () => {
  it('PAID with no amount pays the full total', () => {
    expect(resolvePayment(100, PaymentStatus.PAID, 0, 0)).toEqual({
      amountPaid: 100,
      paymentStatus: PaymentStatus.PAID,
    });
  });

  it('UNPAID forces amount to 0', () => {
    expect(resolvePayment(100, PaymentStatus.UNPAID, 50, 0)).toEqual({
      amountPaid: 0,
      paymentStatus: PaymentStatus.UNPAID,
    });
  });

  it('PARTIAL keeps a valid amount', () => {
    expect(resolvePayment(100, PaymentStatus.PARTIAL, 40, 0)).toEqual({
      amountPaid: 40,
      paymentStatus: PaymentStatus.PARTIAL,
    });
  });

  it.each([0, 100, 150])('PARTIAL rejects amount %p', (amount) => {
    expect(() => resolvePayment(100, PaymentStatus.PARTIAL, amount, 0)).toThrow();
  });

  it('no status falls back to the default amount', () => {
    expect(resolvePayment(100, undefined, undefined, 100).paymentStatus).toBe(PaymentStatus.PAID);
    expect(resolvePayment(100, undefined, undefined, 0).paymentStatus).toBe(PaymentStatus.UNPAID);
  });
});
