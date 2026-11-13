'use client';

import { useOrderBookers } from '@/hooks/use-sales';
import { MultiSelect } from './multi-select';

/** Own component so the Order Booker names are only fetched for people allowed to see every sale. */
export function UserFilter({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const { orderBookers } = useOrderBookers(null);
  return (
    <MultiSelect
      label="Order Booker"
      value={value}
      onChange={onChange}
      options={orderBookers.map((o) => ({ value: o.id, label: o.name }))}
    />
  );
}
