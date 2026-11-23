import { BadRequestException } from '@nestjs/common';
import { datePeriod, spanOfSales } from './supply-range';

describe('supply report date window', () => {
  it('ignores the dates when an invoice number range is given', () => {
    expect(datePeriod({ from: '2026-11-16', to: '2026-11-21', invoiceFrom: '5' })).toBeNull();
    expect(datePeriod({ invoiceTo: '9' })).toBeNull();
    // even dates that would otherwise be rejected
    expect(datePeriod({ from: '2026-11-21', to: '2026-01-01', invoiceFrom: '5', invoiceTo: '9' })).toBeNull();
  });

  it('requires and validates the dates when no invoice number is given', () => {
    expect(datePeriod({ from: '2026-11-16', to: '2026-11-21' })).toMatchObject({ from: expect.any(Date), to: expect.any(Date) });
    expect(() => datePeriod({})).toThrow(BadRequestException);
    expect(() => datePeriod({ from: '2026-11-21', to: '2026-11-16' })).toThrow('"From" is after "To"');
    expect(() => datePeriod({ from: '2026-01-01', to: '2026-12-31' })).toThrow(/at most 62 days/);
  });

  it('reports the Karachi days the invoices were sold on', () => {
    // 20:00 UTC on the 15th is already the 16th in Karachi (UTC+5).
    const sales = [{ saleDate: new Date('2026-11-15T20:00:00Z') }, { saleDate: new Date('2026-11-19T07:00:00Z') }];
    expect(spanOfSales(sales)).toEqual({ from: '2026-11-16', to: '2026-11-19' });
    expect(spanOfSales([], new Date('2026-11-21T10:00:00Z'))).toEqual({ from: '2026-11-21', to: '2026-11-21' });
  });
});
