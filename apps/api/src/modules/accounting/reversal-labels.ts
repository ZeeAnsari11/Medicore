import { JournalEntrySourceType } from '@medicore/shared-types';

/**
 * A reversal entry copies the lines of the entry it undoes, so its lines still say "Purchase on account"
 * and read like a new purchase. The ledgers show these texts for reversals instead.
 */
export const REVERSAL_DESCRIPTION: Partial<Record<JournalEntrySourceType, string>> = {
  [JournalEntrySourceType.PURCHASE_EDIT]: 'Reversal: purchase edited, old amount removed',
  [JournalEntrySourceType.PURCHASE_CANCELLATION]: 'Reversal: purchase cancelled',
  [JournalEntrySourceType.SALE_EDIT]: 'Reversal: invoice edited, old amount removed',
  [JournalEntrySourceType.SALE_CANCELLATION]: 'Reversal: invoice voided',
  [JournalEntrySourceType.PAYMENT_VOID]: 'Reversal: payment voided',
};
