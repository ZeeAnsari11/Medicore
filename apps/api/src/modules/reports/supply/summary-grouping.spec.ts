import { groupSummary, type SummaryInvoice } from './summary-grouping';

let n = 0;
const inv = (o: Partial<SummaryInvoice> & { orderBookerName: string }): SummaryInvoice => {
  n += 1;
  return {
    saleId: `s${n}`,
    invoiceNumber: String(n),
    invoiceSeq: n,
    orderBookerId: o.orderBookerName,
    customerId: 'c1',
    customerName: 'C',
    territory: 'North',
    lineCount: 1,
    net: 100,
    previous: 0,
    ...o,
  };
};

describe('groupSummary', () => {
  it('is empty for no invoices', () => {
    expect(groupSummary([])).toEqual({ bookers: [], grand: { previous: 0, net: 0, total: 0 } });
  });

  it('sections by order booker (sorted), then area, with totals', () => {
    const out = groupSummary([
      inv({ orderBookerName: 'Zain', customerId: 'a', previous: 50, net: 100 }),
      inv({ orderBookerName: 'Ali', customerId: 'b', territory: 'South', previous: 10, net: 20 }),
      inv({ orderBookerName: 'Ali', customerId: 'c', territory: 'North', previous: 5, net: 30 }),
    ]);
    expect(out.bookers.map((b) => b.orderBookerName)).toEqual(['Ali', 'Zain']);
    expect(out.bookers[0].areas.map((a) => a.territory)).toEqual(['North', 'South']);
    expect(out.bookers[0].subtotal).toEqual({ previous: 15, net: 50, total: 65 });
    expect(out.grand).toEqual({ previous: 65, net: 150, total: 215 });
  });

  it("counts a customer's previous once per area and booker, and once overall", () => {
    const out = groupSummary([
      inv({ orderBookerName: 'Ali', customerId: 'a', previous: 100, net: 10 }),
      inv({ orderBookerName: 'Ali', customerId: 'a', previous: 110, net: 10 }),
      inv({ orderBookerName: 'Zain', customerId: 'a', previous: 100, net: 10 }),
    ]);
    expect(out.bookers[0].subtotal.previous).toBe(100);
    expect(out.bookers[0].areas[0].subtotal).toEqual({ previous: 100, net: 20, total: 120 });
    expect(out.bookers[1].subtotal).toEqual({ previous: 120, net: 10, total: 130 }); // carries on from Ali's two
    expect(out.grand).toEqual({ previous: 100, net: 30, total: 130 });
  });

  it("chains a customer's invoices: each previous is the row above's total", () => {
    // Ledger order differed from invoice order, so the raw previous amounts repeat (520 CR twice).
    const out = groupSummary([
      inv({ orderBookerName: 'Ali', customerId: 'c', previous: -520, net: 445 }),
      inv({ orderBookerName: 'Ali', customerId: 'c', previous: -520, net: 360 }),
      inv({ orderBookerName: 'Ali', customerId: 'c', previous: -160, net: 378 }),
    ]);
    const rows = out.bookers[0].areas[0].rows;
    expect(rows.map((r) => [r.previous, r.total])).toEqual([[-520, -75], [-75, 285], [285, 663]]);
    expect(out.bookers[0].areas[0].subtotal).toEqual({ previous: -520, net: 1183, total: 663 });
    expect(out.grand.total).toBe(663);
  });
});
