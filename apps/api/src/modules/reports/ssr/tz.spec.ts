import { karachiDayEnd, karachiDayStart, previousRange, rangeOf } from './tz';

describe('Karachi day boundaries', () => {
  it('starts a Karachi day at 19:00Z of the previous UTC day', () => {
    expect(karachiDayStart('2026-11-08').toISOString()).toBe('2026-11-07T19:00:00.000Z');
  });

  it('ends a Karachi day at 18:59:59.999Z of the same UTC day', () => {
    expect(karachiDayEnd('2026-11-08').toISOString()).toBe('2026-11-08T18:59:59.999Z');
  });

  it('puts 23:30 PKT and 00:30 PKT the next day on different days', () => {
    const lateNight = new Date('2026-11-08T18:30:00Z'); // 23:30 PKT on the 8th
    const afterMidnight = new Date('2026-11-08T19:30:00Z'); // 00:30 PKT on the 9th
    const day8 = rangeOf('2026-11-08', '2026-11-08');
    expect(lateNight >= day8.from && lateNight <= day8.to).toBe(true);
    expect(afterMidnight >= day8.from && afterMidnight <= day8.to).toBe(false);
  });

  it('builds the previous period with the same length', () => {
    const range = rangeOf('2026-11-08', '2026-11-10');
    const prev = previousRange(range);
    expect(prev.to.getTime()).toBe(range.from.getTime() - 1);
    expect(prev.to.getTime() - prev.from.getTime()).toBe(range.to.getTime() - range.from.getTime());
  });
});
