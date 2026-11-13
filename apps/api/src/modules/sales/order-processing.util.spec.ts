import { orderDayRange, sortOrdersForConfirmation } from './order-processing.util';

describe('orderDayRange', () => {
  it('starts the day at midnight Pakistan time, which is 19:00 UTC the day before', () => {
    const { start, end } = orderDayRange('2026-11-13');
    expect(start.toISOString()).toBe('2026-11-12T19:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-13T19:00:00.000Z');
  });

  it('puts an order placed at 09:15 Pakistan time inside its own day only', () => {
    const placed = new Date('2026-11-13T04:15:00.000Z');
    const today = orderDayRange('2026-11-13');
    const tomorrow = orderDayRange('2026-11-14');
    expect(placed >= today.start && placed < today.end).toBe(true);
    expect(placed >= tomorrow.start && placed < tomorrow.end).toBe(false);
  });
});

describe('sortOrdersForConfirmation', () => {
  it('orders the oldest first without changing the input', () => {
    const a = { id: 'a', createdAt: new Date('2026-11-13T06:00:00Z') };
    const b = { id: 'b', createdAt: new Date('2026-11-13T04:00:00Z') };
    const c = { id: 'c', createdAt: new Date('2026-11-13T05:00:00Z') };
    const input = [a, b, c];
    expect(sortOrdersForConfirmation(input, (o) => o.createdAt).map((o) => o.id)).toEqual(['b', 'c', 'a']);
    expect(input.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });
});
