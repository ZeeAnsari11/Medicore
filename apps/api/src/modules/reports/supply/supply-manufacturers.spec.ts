import { limitToManufacturers } from './supply-manufacturers';

const items = [{ productId: 'p1' }, { productId: 'p2' }, { productId: 'p3' }, { productId: 'gone' }];
const manufacturerOf = new Map<string, string | undefined>([['p1', 'm1'], ['p2', 'm2'], ['p3', undefined]]);

describe('limitToManufacturers', () => {
  it('keeps every item when no manufacturer pick is sent', () => {
    expect(limitToManufacturers(items, manufacturerOf)).toBe(items);
  });

  it("keeps only the picked manufacturers' items", () => {
    expect(limitToManufacturers(items, manufacturerOf, new Set(['m1'])).map((i) => i.productId)).toEqual(['p1']);
    expect(limitToManufacturers(items, manufacturerOf, new Set(['m1', 'm2'])).map((i) => i.productId)).toEqual(['p1', 'p2']);
  });

  it('drops items whose product or manufacturer is unknown', () => {
    expect(limitToManufacturers(items, manufacturerOf, new Set(['m9']))).toEqual([]);
  });
});
