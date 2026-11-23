import { ConflictException } from '@nestjs/common';
import { splitMovedLines, type OldBatchReceipt } from './purchase-batch-move';

const line = (over: Partial<Parameters<typeof splitMovedLines>[0][number]> = {}) => ({
  productId: 'p1',
  batchNumber: 'F',
  expiryDate: '2028-01-01',
  quantity: 10,
  purchasePrice: 5,
  sourceBatchId: 'bX',
  ...over,
});
const receipt = (over: Partial<OldBatchReceipt> = {}): Map<string, OldBatchReceipt> =>
  new Map([['bX', { productId: 'p1', batchNumber: 'X', expiry: '2027-06-01', qty: 10, sold: 5, ...over }]]);

describe('splitMovedLines', () => {
  it('splits a partly sold line: sold units stay on the old batch, the rest go to the new one', () => {
    const out = splitMovedLines([line()], receipt());
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ batchNumber: 'X', expiryDate: '2027-06-01', quantity: 5, purchasePrice: 5 });
    expect(out[1]).toMatchObject({ batchNumber: 'F', expiryDate: '2028-01-01', quantity: 5, purchasePrice: 5 });
  });

  it('keeps the total quantity when the line quantity was also changed', () => {
    const out = splitMovedLines([line({ quantity: 12 })], receipt());
    expect(out.map((l) => [l.batchNumber, l.quantity])).toEqual([['X', 5], ['F', 7]]);
  });

  it('leaves a line alone when nothing was sold (plain rename)', () => {
    const items = [line()];
    expect(splitMovedLines(items, receipt({ sold: 0 }))).toEqual(items);
  });

  it('leaves lines alone when the batch number is unchanged, there is no source, or the source is unknown', () => {
    expect(splitMovedLines([line({ batchNumber: 'X' })], receipt())).toHaveLength(1);
    expect(splitMovedLines([line({ sourceBatchId: undefined })], receipt())).toHaveLength(1);
    expect(splitMovedLines([line({ sourceBatchId: 'other' })], receipt())).toHaveLength(1);
    expect(splitMovedLines([line({ productId: 'p2' })], receipt())).toHaveLength(1);
  });

  it('refuses when everything was sold, or the quantity drops below what was sold', () => {
    expect(() => splitMovedLines([line()], receipt({ sold: 10 }))).toThrow(ConflictException);
    expect(() => splitMovedLines([line({ quantity: 4 })], receipt())).toThrow(/cannot go below 5/);
  });

  it('keeps only the sold row when the quantity equals what was sold', () => {
    const out = splitMovedLines([line({ quantity: 5 })], receipt());
    expect(out.map((l) => [l.batchNumber, l.quantity])).toEqual([['X', 5]]);
  });

  it('splits one source only once', () => {
    const out = splitMovedLines([line(), line({ batchNumber: 'G', quantity: 2 })], receipt());
    expect(out.map((l) => l.batchNumber)).toEqual(['X', 'F', 'G']);
  });
});
