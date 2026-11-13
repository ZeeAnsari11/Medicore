import { ReturnStatus } from '@medicore/shared-types';
import { evaluateEditState } from './invoice-editability';

describe('evaluateEditState', () => {
  const unpaid = { amountPaid: 0, returnedTotal: 0, returnStatus: ReturnStatus.NONE, cancelled: false };

  it('is editable while nothing is paid, returned or cancelled', () => {
    expect(evaluateEditState(unpaid, 0)).toEqual({ isEditable: true });
  });

  it('is locked by money taken at creation (amountPaid, no Payment record)', () => {
    expect(evaluateEditState({ ...unpaid, amountPaid: 50 }, 0)).toEqual({
      isEditable: false,
      lockReason: 'Payment recorded',
    });
  });

  it('is locked by a live Payment allocation', () => {
    expect(evaluateEditState(unpaid, 1)).toEqual({ isEditable: false, lockReason: 'Payment recorded' });
  });

  it('is editable again once every payment is gone', () => {
    expect(evaluateEditState({ ...unpaid, amountPaid: 0 }, 0).isEditable).toBe(true);
  });

  it('is locked by returns', () => {
    expect(evaluateEditState({ ...unpaid, returnedTotal: 10 }, 0).lockReason).toBe('Has returns');
    expect(evaluateEditState({ ...unpaid, returnStatus: ReturnStatus.PARTIAL }, 0).lockReason).toBe('Has returns');
  });

  it('is locked when cancelled, and that reason wins', () => {
    expect(evaluateEditState({ ...unpaid, amountPaid: 50, cancelled: true }, 2)).toEqual({
      isEditable: false,
      lockReason: 'Cancelled',
    });
  });
});
