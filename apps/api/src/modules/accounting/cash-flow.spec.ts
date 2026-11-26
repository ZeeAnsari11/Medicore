import { buildCashFlow } from './cash-flow';

describe('buildCashFlow', () => {
  it('opens with earlier cash, groups the period by activity and closes at opening + net change', () => {
    const r = buildCashFlow([
      { sourceType: 'PAYMENT_RECEIVED', before: true, debit: 1000, credit: 0 },
      { sourceType: 'EXPENSE', before: true, debit: 0, credit: 200 },
      { sourceType: 'PAYMENT_RECEIVED', before: false, debit: 500, credit: 0 },
      { sourceType: 'PAYMENT_MADE', before: false, debit: 0, credit: 120 },
      { sourceType: 'OPENING_BALANCE', before: false, debit: 50, credit: 0 },
    ]);

    expect(r.openingCash).toBe(800);
    const operating = r.sections.find((s) => s.section === 'OPERATING')!;
    expect(operating.inflow).toBe(500);
    expect(operating.outflow).toBe(120);
    expect(operating.rows.map((x) => x.label)).toEqual(['Received from customers', 'Paid to vendors']);
    expect(r.sections.find((s) => s.section === 'FINANCING')!.net).toBe(50);
    expect(r.sections.find((s) => s.section === 'INVESTING')!.rows).toEqual([]);
    expect(r.netChange).toBe(430);
    expect(r.closingCash).toBe(1230);
  });

  it('returns zeros when nothing touched cash', () => {
    const r = buildCashFlow([]);
    expect(r).toMatchObject({ openingCash: 0, totalInflow: 0, totalOutflow: 0, netChange: 0, closingCash: 0 });
  });

  it('nets a voided payment into the line it undid instead of listing it', () => {
    const r = buildCashFlow([
      { sourceType: 'PAYMENT_RECEIVED', before: false, debit: 500, credit: 0 },
      { sourceType: 'PAYMENT_MADE', before: false, debit: 0, credit: 300 },
      { sourceType: 'PAYMENT_VOID', before: false, debit: 100, credit: 40 },
    ]);
    const rows = r.sections.flatMap((s) => s.rows);
    expect(rows.find((x) => x.sourceType === 'PAYMENT_RECEIVED')!.inflow).toBe(460);
    expect(rows.find((x) => x.sourceType === 'PAYMENT_MADE')!.outflow).toBe(200);
    expect(rows.some((x) => x.sourceType === 'PAYMENT_VOID')).toBe(false);
    expect(r.closingCash).toBe(260);
  });
});
