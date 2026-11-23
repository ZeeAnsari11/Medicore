import { BadRequestException } from '@nestjs/common';
import { karachiDayStart, rangeOf, type DateRange } from '../ssr/tz';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SUPPLY_MAX_DAYS = 62;

interface RangeQuery {
  from?: string;
  to?: string;
  invoiceFrom?: string;
  invoiceTo?: string;
}

/** Karachi calendar day (yyyy-mm-dd) of an instant. */
export const karachiDayOf = (d: Date): string => new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * The sale-date window a supply sheet covers. When an invoice number range is given it alone picks the
 * invoices and the dates are ignored (null); otherwise both dates are required and validated.
 */
export function datePeriod(q: RangeQuery): DateRange | null {
  if (q.invoiceFrom || q.invoiceTo) return null;
  if (!q.from || !q.to) throw new BadRequestException('Choose both dates, or an invoice number range');
  const range = rangeOf(q.from, q.to);
  if (Number.isNaN(range.from.getTime()) || Number.isNaN(range.to.getTime())) throw new BadRequestException('Invalid date');
  if (range.from > range.to) throw new BadRequestException('"From" is after "To"');
  if ((range.to.getTime() - range.from.getTime()) / DAY_MS > SUPPLY_MAX_DAYS)
    throw new BadRequestException(`Choose a period of at most ${SUPPLY_MAX_DAYS} days`);
  return range;
}

/** The days the found invoices were sold on (today when there are none), for the printed header and balances. */
export function spanOfSales(sales: Array<{ saleDate: Date }>, now = new Date()): { from: string; to: string } {
  if (sales.length === 0) return { from: karachiDayOf(now), to: karachiDayOf(now) };
  const times = sales.map((s) => new Date(s.saleDate).getTime());
  return { from: karachiDayOf(new Date(Math.min(...times))), to: karachiDayOf(new Date(Math.max(...times))) };
}

export const spanRange = (span: { from: string; to: string }): DateRange => ({
  from: karachiDayStart(span.from),
  to: rangeOf(span.from, span.to).to,
});
