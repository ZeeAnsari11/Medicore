import { ReturnStatus } from '@medicore/shared-types';

export interface EditStateInput {
  amountPaid?: number;
  returnedTotal?: number;
  returnStatus?: ReturnStatus;
  /** Sale.deletedAt (void) or Purchase.status === CANCELLED. */
  cancelled: boolean;
}

export type LockReason = 'Cancelled' | 'Has returns' | 'Payment recorded';

/**
 * An invoice is editable only while no money has been recorded against it: no amountPaid (which also
 * covers money taken at creation, where no Payment document exists), no live Payment allocation, no
 * return, and not cancelled.
 */
export function evaluateEditState(
  invoice: EditStateInput,
  paymentCount: number,
): { isEditable: boolean; lockReason?: LockReason } {
  if (invoice.cancelled) return { isEditable: false, lockReason: 'Cancelled' };
  if ((invoice.returnedTotal ?? 0) > 0 || (invoice.returnStatus && invoice.returnStatus !== ReturnStatus.NONE)) {
    return { isEditable: false, lockReason: 'Has returns' };
  }
  if ((invoice.amountPaid ?? 0) > 0.001 || paymentCount > 0) {
    return { isEditable: false, lockReason: 'Payment recorded' };
  }
  return { isEditable: true };
}
