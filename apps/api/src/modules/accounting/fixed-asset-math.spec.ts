import { disposalGainLoss } from './fixed-asset-math';

describe('disposalGainLoss', () => {
  it('is proceeds less cost: a loss when sold for less, a gain when sold for more', () => {
    expect(disposalGainLoss(200, 180)).toBe(-20);
    expect(disposalGainLoss(200, 250)).toBe(50);
    expect(disposalGainLoss(200, 200)).toBe(0);
  });

  it('is the whole cost lost on a write-off', () => {
    expect(disposalGainLoss(10000, 0)).toBe(-10000);
  });
});
