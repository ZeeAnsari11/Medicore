import { NO_CITY_FILTER, NO_TERRITORY_FILTER, territoriesOfCities } from '@medicore/shared-types';

const places = [
  { city: 'Kasur', territory: 'Theeng More' },
  { city: 'Kasur', territory: 'Kangan Pur' },
  { city: 'Mustafa Abad', territory: 'Main Market' },
  { city: 'Lahore', territory: 'Main Market' },
  { city: '', territory: 'Roadside' },
];

describe('territoriesOfCities', () => {
  it('lists only the territories of the ticked cities, A-Z, with "no territory" last', () => {
    expect(territoriesOfCities(['Kasur'], places)).toEqual(['Kangan Pur', 'Theeng More', NO_TERRITORY_FILTER]);
    expect(territoriesOfCities(['Kasur', 'Mustafa Abad'], places)).toEqual(['Kangan Pur', 'Main Market', 'Theeng More', NO_TERRITORY_FILTER]);
  });

  it('drops a city\'s territories when it is unticked, but keeps a name another ticked city also has', () => {
    expect(territoriesOfCities(['Mustafa Abad'], places)).toEqual(['Main Market', NO_TERRITORY_FILTER]);
    expect(territoriesOfCities(['Mustafa Abad', 'Lahore'], places)).toEqual(['Main Market', NO_TERRITORY_FILTER]);
  });

  it('"no city" brings the territories of customers without a city', () => {
    expect(territoriesOfCities([NO_CITY_FILTER], places)).toEqual(['Roadside', NO_TERRITORY_FILTER]);
  });

  it('offers just "no territory" when no city is ticked', () => {
    expect(territoriesOfCities([], places)).toEqual([NO_TERRITORY_FILTER]);
  });
});
