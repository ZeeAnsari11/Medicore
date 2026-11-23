import { PaymentMethod } from '@medicore/shared-types';

/** 1,234.50 */
export const formatAmount = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Cash',
  [PaymentMethod.CARD]: 'Card',
  [PaymentMethod.BANK_TRANSFER]: 'Bank transfer',
  [PaymentMethod.CREDIT]: 'Credit',
};
