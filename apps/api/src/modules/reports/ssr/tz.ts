/** Business time zone is Asia/Karachi: fixed UTC+5, no DST, so day boundaries are a constant offset. */
const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const parts = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Instant of 00:00:00.000 on the given Karachi calendar day (yyyy-mm-dd). */
export const karachiDayStart = (day: string): Date => new Date(parts(day) - KARACHI_OFFSET_MS);

/** Instant of 23:59:59.999 on the given Karachi calendar day. */
export const karachiDayEnd = (day: string): Date => new Date(parts(day) - KARACHI_OFFSET_MS + DAY_MS - 1);

export interface DateRange {
  from: Date;
  to: Date;
}

export const rangeOf = (fromDay: string, toDay: string): DateRange => ({
  from: karachiDayStart(fromDay),
  to: karachiDayEnd(toDay),
});

/** The equally long window ending right before `range` starts. */
export const previousRange = (range: DateRange): DateRange => {
  const length = range.to.getTime() - range.from.getTime() + 1;
  return { from: new Date(range.from.getTime() - length), to: new Date(range.from.getTime() - 1) };
};
