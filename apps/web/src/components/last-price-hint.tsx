import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LastPrice {
  productId: string;
  price: number | null;
  date: string | null;
}

export function formatRs(n: number): string {
  return Number.isInteger(n) ? `Rs. ${n}` : `Rs. ${n.toFixed(2)}`;
}

interface LastPriceHintProps {
  label: string;
  last: LastPrice | undefined;
  /** Current value of the price input. */
  current: number;
  /** Purchases: lower is good. Sales: higher is good. */
  higherIsGood: boolean;
  /** Shown when the lookup finished with no history. */
  emptyText?: string;
  /** Purchases: spell out the entered price ("Now Rs. 30, Rs. 10 higher"). */
  showNow?: boolean;
}

export function LastPriceHint({ label, last, current, higherIsGood, emptyText, showNow }: LastPriceHintProps) {
  if (!last) return null;
  if (last.price === null) {
    return emptyText ? <p className="mt-1 text-[11px] text-muted-foreground">{emptyText}</p> : null;
  }
  const diff = (Number(current) || 0) - last.price;
  const good = higherIsGood ? diff > 0 : diff < 0;
  const tone = diff === 0 ? 'text-muted-foreground' : good ? 'text-green-600' : 'text-red-600';
  return (
    <div className="mt-1 max-w-[140px] text-[11px] leading-tight">
      <p className="text-muted-foreground">
        {label}: {formatRs(last.price)}
        {last.date && ` (${new Date(last.date).toLocaleDateString()})`}
      </p>
      <p className={cn('flex items-center gap-0.5', tone)}>
        {diff > 0 && <ArrowUp className="h-3 w-3" />}
        {diff < 0 && <ArrowDown className="h-3 w-3" />}
        {diff === 0
          ? 'Same as last price'
          : showNow
            ? `Now ${formatRs(Number(current) || 0)}, ${formatRs(Math.abs(Number(diff.toFixed(2))))} ${diff > 0 ? 'higher' : 'lower'}`
            : `${formatRs(Math.abs(Number(diff.toFixed(2))))} ${diff > 0 ? 'higher' : 'lower'} than last price`}
      </p>
    </div>
  );
}
