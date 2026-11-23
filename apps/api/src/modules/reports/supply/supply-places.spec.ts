import { NO_CITY_FILTER, NO_TERRITORY_FILTER } from '@medicore/shared-types';
import { placeFilter } from './supply-places';

describe('supply report city / territory filter', () => {
  it('does nothing when neither list is sent (older app builds)', () => {
    expect(placeFilter({})).toEqual({ customer: null, includeWalkIn: true });
    expect(placeFilter({ city: [], territory: [] })).toEqual({ customer: null, includeWalkIn: true });
  });

  it('picks customers in the ticked cities', () => {
    const f = placeFilter({ city: ['Kasur', 'Lahore'] });
    expect(f.customer).toEqual({ $and: [{ $or: [{ city: { $in: ['Kasur', 'Lahore'] } }] }] });
    expect(f.includeWalkIn).toBe(false);
  });

  it('"no city" brings in customers without a city and walk-in sales', () => {
    const f = placeFilter({ city: ['Kasur', NO_CITY_FILTER] });
    expect(f.customer).toEqual({ $and: [{ $or: [{ city: { $in: ['Kasur'] } }, { city: { $in: [null, ''] } }] }] });
    expect(f.includeWalkIn).toBe(true);
  });

  it('walk-in sales need both the no-city and the no-territory choice', () => {
    expect(placeFilter({ city: [NO_CITY_FILTER], territory: ['Theeng More'] }).includeWalkIn).toBe(false);
    expect(placeFilter({ city: [NO_CITY_FILTER], territory: [NO_TERRITORY_FILTER] }).includeWalkIn).toBe(true);
  });

  it('combines city and territory with AND', () => {
    const f = placeFilter({ city: ['Kasur'], territory: ['Theeng More', NO_TERRITORY_FILTER] });
    expect(f.customer).toEqual({
      $and: [
        { $or: [{ city: { $in: ['Kasur'] } }] },
        { $or: [{ territory: { $in: ['Theeng More'] } }, { territory: { $in: [null, ''] } }] },
      ],
    });
  });
});
