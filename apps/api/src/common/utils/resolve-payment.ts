import { BadRequestException } from '@nestjs/common';
import { PaymentStatus } from '@medicore/shared-types';

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Turns the client's requested paymentStatus / amountPaid into a consistent pair.
 * The requested status only decides amountPaid when it is missing; the stored
 * status is always re-derived from the amount so the two can never disagree.
 */
export function resolvePayment(
  grandTotal: number,
  requestedStatus: PaymentStatus | undefined,
  requestedAmount: number | undefined,
  defaultAmount: number,
): { amountPaid: number; paymentStatus: PaymentStatus } {
  let amountPaid = round2(requestedAmount ?? defaultAmount);

  if (requestedStatus === PaymentStatus.PAID && !(amountPaid > 0)) {
    amountPaid = round2(grandTotal);
  } else if (requestedStatus === PaymentStatus.UNPAID) {
    amountPaid = 0;
  } else if (requestedStatus === PaymentStatus.PARTIAL) {
    if (!(amountPaid > 0 && amountPaid < grandTotal - 0.01)) {
      throw new BadRequestException(
        'Partial payment requires an amount greater than 0 and less than the total',
      );
    }
  }

  const paymentStatus =
    amountPaid >= grandTotal - 0.01
      ? PaymentStatus.PAID
      : amountPaid > 0
        ? PaymentStatus.PARTIAL
        : PaymentStatus.UNPAID;

  return { amountPaid, paymentStatus };
}
