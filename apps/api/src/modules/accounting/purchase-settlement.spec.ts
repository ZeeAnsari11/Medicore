import { splitPurchaseSettlement } from './purchase-settlement';

describe('splitPurchaseSettlement', () => {
  it('an unpaid purchase is all on account', () => {
    expect(splitPurchaseSettlement(30000, 0)).toEqual({
      apPortion: 30000,
      advancePortion: 0,
      cashPortion: 0,
    });
  });

  it('cash paid at purchase time is not an advance', () => {
    expect(splitPurchaseSettlement(30000, 10000)).toEqual({
      apPortion: 20000,
      advancePortion: 0,
      cashPortion: 10000,
    });
  });

  it('an advance that covers the bill settles it in full with no cash and nothing on account', () => {
    expect(splitPurchaseSettlement(30000, 30000, 30000)).toEqual({
      apPortion: 0,
      advancePortion: 30000,
      cashPortion: 0,
    });
  });

  it('a smaller advance leaves the rest on account', () => {
    expect(splitPurchaseSettlement(30000, 20000, 20000)).toEqual({
      apPortion: 10000,
      advancePortion: 20000,
      cashPortion: 0,
    });
  });

  it('advance plus cash together make up the paid amount', () => {
    expect(splitPurchaseSettlement(30000, 25000, 20000)).toEqual({
      apPortion: 5000,
      advancePortion: 20000,
      cashPortion: 5000,
    });
  });

  it('never takes more from the advance than was paid, or a negative amount', () => {
    expect(splitPurchaseSettlement(1000, 400, 900)).toEqual({
      apPortion: 600,
      advancePortion: 400,
      cashPortion: 0,
    });
    expect(splitPurchaseSettlement(1000, 400, -50)).toEqual({
      apPortion: 600,
      advancePortion: 0,
      cashPortion: 400,
    });
  });

  it('the three portions always add up to the total', () => {
    for (const [total, paid, advance] of [
      [30000, 12345.67, 5000.5],
      [99.99, 99.99, 40.01],
      [500, 0, 0],
    ]) {
      const s = splitPurchaseSettlement(total, paid, advance);
      expect(Math.round((s.apPortion + s.advancePortion + s.cashPortion) * 100) / 100).toBe(total);
    }
  });
});
