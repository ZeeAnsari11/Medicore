/** Orders are grouped by calendar day in Pakistan time (UTC+5, no DST). */
const ORDER_DAY_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The [start, end) instants of a yyyy-mm-dd day in Pakistan time. */
export function orderDayRange(date: string): { start: Date; end: Date } {
  const start = new Date(new Date(`${date}T00:00:00.000Z`).getTime() - ORDER_DAY_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Invoice numbers are issued oldest order first, so they follow the order the bookers placed them in. */
export function sortOrdersForConfirmation<T>(orders: T[], placedAt: (order: T) => Date): T[] {
  return [...orders].sort((a, b) => placedAt(a).getTime() - placedAt(b).getTime());
}
