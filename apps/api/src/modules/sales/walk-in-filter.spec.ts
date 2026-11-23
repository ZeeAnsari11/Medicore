import { customerFilter, isWalkInFilter } from './walk-in-filter';

describe('walk-in customer filter', () => {
  it('matches sales without a customer for the walk-in token', () => {
    expect(isWalkInFilter('walkin')).toBe(true);
    expect(customerFilter('walkin')).toEqual({ $in: [null, ''] });
  });

  it('passes a real customer id through unchanged', () => {
    expect(isWalkInFilter('6b016b394859044dcaac6364')).toBe(false);
    expect(customerFilter('6b016b394859044dcaac6364')).toBe('6b016b394859044dcaac6364');
  });
});
