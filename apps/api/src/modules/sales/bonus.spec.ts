import { allocationsOf, splitBonus } from './bonus';

const a = (batchId: string, quantity: number) => ({ batchId, quantity });

describe('splitBonus', () => {
  it('gives the first units to the sold quantity and the rest to the bonus', () => {
    expect(splitBonus([a('b1', 10)], 8)).toEqual({ paid: [a('b1', 8)], bonus: [a('b1', 2)] });
  });

  it('cuts the batch that straddles the boundary and spills bonus into the next batch', () => {
    expect(splitBonus([a('b1', 5), a('b2', 7)], 5)).toEqual({ paid: [a('b1', 5)], bonus: [a('b2', 7)] });
    expect(splitBonus([a('b1', 5), a('b2', 7)], 7)).toEqual({ paid: [a('b1', 5), a('b2', 2)], bonus: [a('b2', 5)] });
  });

  it('has no bonus when everything is sold, and no paid units for a bonus-only line', () => {
    expect(splitBonus([a('b1', 4)], 4).bonus).toEqual([]);
    expect(splitBonus([a('b1', 4)], 0)).toEqual({ paid: [], bonus: [a('b1', 4)] });
  });
});

describe('allocationsOf', () => {
  it('lists paid then bonus allocations, tolerating lines saved before bonus existed', () => {
    expect(allocationsOf({ batchAllocations: [a('b1', 2)], bonusAllocations: [a('b2', 1)] })).toEqual([a('b1', 2), a('b2', 1)]);
    expect(allocationsOf({ batchAllocations: [a('b1', 2)] })).toEqual([a('b1', 2)]);
  });
});
