import type { ProductVendorSummary } from '@medicore/shared-types';
import { formatRs } from '@/components/last-price-hint';

/** A product's linked vendors with their agreed price, cheapest first (the summary arrives sorted). */
export function VendorPriceList({ vendors }: { vendors: ProductVendorSummary['vendors'] }) {
  if (vendors.length === 0) return <>—</>;
  return (
    <span title={vendors.map((v) => `${v.company}: ${formatRs(v.purchasePrice)}`).join(', ')}>
      {vendors.map((v, i) => (
        <span key={v.vendorId} className={i === 0 && vendors.length > 1 ? 'font-semibold' : undefined}>
          {i > 0 && ', '}
          {v.company}: {formatRs(v.purchasePrice)}
        </span>
      ))}
    </span>
  );
}
