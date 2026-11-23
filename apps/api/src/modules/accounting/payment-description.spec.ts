import { paymentNote } from './payment-description';

describe('paymentNote', () => {
  it('a vendor payment with no bill selected is an advance payment', () => {
    expect(paymentNote({ partyType: 'VENDOR', allocated: 0, remainder: 50000 })).toBe(
      'Advance payment',
    );
  });

  it('a customer payment with no invoice selected is an advance received', () => {
    expect(paymentNote({ partyType: 'CUSTOMER', allocated: 0, remainder: 300 })).toBe(
      'Advance received',
    );
  });

  it('a payment that pays a bill and has money left over says how much is advance', () => {
    expect(paymentNote({ partyType: 'VENDOR', allocated: 30000, remainder: 20000 })).toBe(
      'Includes advance of 20000.00',
    );
  });

  it('a payment fully applied to bills gets no automatic note', () => {
    expect(paymentNote({ partyType: 'VENDOR', allocated: 1000, remainder: 0 })).toBeUndefined();
  });

  it('what the user typed always wins, even for an advance', () => {
    expect(
      paymentNote({
        notes: '  Deposit for Jan order ',
        partyType: 'VENDOR',
        allocated: 0,
        remainder: 500,
      }),
    ).toBe('Deposit for Jan order');
  });

  it('ignores a blank note', () => {
    expect(paymentNote({ notes: '   ', partyType: 'VENDOR', allocated: 0, remainder: 500 })).toBe(
      'Advance payment',
    );
  });
});
