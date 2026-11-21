import { previousBalancesFromEntries, type LedgerWalkEntry } from './previous-balance';

const SALE = 'SALE';
const entry = (sourceType: string, sourceId: string, debit: number, credit: number, status = 'POSTED'): LedgerWalkEntry => ({
  sourceType,
  sourceId,
  status,
  lines: [{ partyId: 'c1', debit, credit }],
});
const sale = (id: string, customerId = 'c1') => ({ _id: id, customerId });

describe('previousBalancesFromEntries', () => {
  it('is the customer balance before the invoice: opening plus earlier invoices and payments', () => {
    const out = previousBalancesFromEntries(
      new Map([['c1', 100]]),
      [entry(SALE, 's1', 50, 0), entry('PAYMENT', 'p1', 0, 30), entry(SALE, 's2', 70, 0)],
      [sale('s1'), sale('s2')],
    );
    expect(out.get('s1')).toBe(100);
    expect(out.get('s2')).toBe(120); // 100 + 50 - 30
  });

  it('an edited invoice does not count its own replaced version (85.50 -> 90.00 on a customer with no other debt)', () => {
    // Order the ledger gives: the original 85.50 entry, the NEW live 90.00 entry (invoice date), then the
    // reversal of the original, which was posted "now" and so sorts last.
    const out = previousBalancesFromEntries(
      new Map(),
      [entry(SALE, 's1', 85.5, 0, 'REVERSED'), entry(SALE, 's1', 90, 0), entry('SALE_EDIT_REVERSAL', 's1', 0, 85.5)],
      [sale('s1')],
    );
    expect(out.get('s1')).toBe(0);
  });

  it("keeps the customer's real earlier debt when an invoice is edited", () => {
    const out = previousBalancesFromEntries(
      new Map([['c1', 40]]),
      [entry(SALE, 's1', 85.5, 0, 'REVERSED'), entry(SALE, 's1', 90, 0), entry('SALE_EDIT_REVERSAL', 's1', 0, 85.5)],
      [sale('s1')],
    );
    expect(out.get('s1')).toBe(40);
  });

  it('a later invoice sees the edited invoice at its final amount only', () => {
    const out = previousBalancesFromEntries(
      new Map(),
      [entry(SALE, 's1', 85.5, 0, 'REVERSED'), entry(SALE, 's1', 90, 0), entry('SALE_EDIT_REVERSAL', 's1', 0, 85.5), entry(SALE, 's2', 20, 0)],
      [sale('s1'), sale('s2')],
    );
    expect(out.get('s2')).toBe(90);
  });

  it("another customer's entries do not leak across customers", () => {
    const other: LedgerWalkEntry = { sourceType: SALE, sourceId: 'x', status: 'POSTED', lines: [{ partyId: 'c2', debit: 999, credit: 0 }] };
    const out = previousBalancesFromEntries(new Map(), [other, entry(SALE, 's1', 10, 0)], [sale('s1')]);
    expect(out.get('s1')).toBe(0);
  });

  it('an invoice with no live entry in the period reads the opening balance', () => {
    const out = previousBalancesFromEntries(new Map([['c1', 55]]), [], [sale('s1')]);
    expect(out.get('s1')).toBe(55);
  });
});
