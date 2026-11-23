import { NO_CITY_FILTER, NO_TERRITORY_FILTER } from '@medicore/shared-types';

interface PlaceQuery {
  city?: string[];
  territory?: string[];
}

const BLANK = { $in: [null, ''] };

/**
 * How the city and territory filters pick customers. Picks are always applied when sent: the "no city" /
 * "no territory" tokens stand for customers without one, and for walk-in sales (no customer at all), which
 * stay on the sheet only while both tokens are ticked (or the filter is not sent, as older app builds do).
 */
export function placeFilter(q: PlaceQuery): { customer: Record<string, unknown> | null; includeWalkIn: boolean } {
  const cities = q.city?.length ? q.city : undefined;
  const territories = q.territory?.length ? q.territory : undefined;
  if (!cities && !territories) return { customer: null, includeWalkIn: true };

  const clause = (field: string, picked: string[], none: string) => {
    const names = picked.filter((p) => p !== none);
    const or: Array<Record<string, unknown>> = [];
    if (names.length) or.push({ [field]: { $in: names } });
    if (picked.includes(none)) or.push({ [field]: BLANK });
    return { $or: or };
  };
  const and: Array<Record<string, unknown>> = [];
  if (cities) and.push(clause('city', cities, NO_CITY_FILTER));
  if (territories) and.push(clause('territory', territories, NO_TERRITORY_FILTER));
  return {
    customer: { $and: and },
    includeWalkIn: (!cities || cities.includes(NO_CITY_FILTER)) && (!territories || territories.includes(NO_TERRITORY_FILTER)),
  };
}
