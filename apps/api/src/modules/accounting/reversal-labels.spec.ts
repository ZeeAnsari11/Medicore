import { JournalEntrySourceType as T } from '@medicore/shared-types';
import { REVERSAL_DESCRIPTION } from './reversal-labels';

describe('REVERSAL_DESCRIPTION', () => {
  it('describes every kind of reversal as a reversal', () => {
    for (const type of [T.PURCHASE_EDIT, T.PURCHASE_CANCELLATION, T.SALE_EDIT, T.SALE_CANCELLATION, T.PAYMENT_VOID]) {
      expect(REVERSAL_DESCRIPTION[type]).toMatch(/^Reversal: /);
    }
  });

  it('leaves ordinary postings with their own description', () => {
    for (const type of [T.PURCHASE, T.SALE, T.PAYMENT_MADE, T.PAYMENT_RECEIVED, T.PURCHASE_RETURN, T.SALE_RETURN]) {
      expect(REVERSAL_DESCRIPTION[type]).toBeUndefined();
    }
  });
});
