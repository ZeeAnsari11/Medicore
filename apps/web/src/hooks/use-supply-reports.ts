import type { SupplyReportFilters, SupplyReportQuery } from '@medicore/shared-types';
import { apiFetch } from '@/lib/api-client';
import { useTenantQuery } from '@/lib/tenant-query';

/** The longest period a supply sheet may cover (the API rejects more). */
export const SUPPLY_MAX_DAYS = 62;

function params(q: SupplyReportQuery): string {
  const out = new URLSearchParams({ from: q.from, to: q.to });
  if (q.branchId) out.set('branchId', q.branchId);
  if (q.invoiceFrom) out.set('invoiceFrom', q.invoiceFrom);
  if (q.invoiceTo) out.set('invoiceTo', q.invoiceTo);
  if (q.city?.length) out.set('city', q.city.join(','));
  if (q.territory?.length) out.set('territory', q.territory.join(','));
  if (q.orderBookerIds?.length) out.set('orderBookerIds', q.orderBookerIds.join(','));
  if (q.customerIds?.length) out.set('customerIds', q.customerIds.join(','));
  return out.toString();
}

export const supplyLedgerPath = (q: SupplyReportQuery) => `/reports/supply-ledger?${params(q)}`;
export const supplySummaryPath = (q: SupplyReportQuery) => `/reports/supply-summary?${params(q)}`;

/** Distinct customer cities and territories for the filter pickers. */
export function useSupplyFilters(branchId: string | null, enabled = true) {
  const query = useTenantQuery({
    queryKey: ['reports', 'supply-filters', branchId],
    queryFn: () => apiFetch<SupplyReportFilters>(`/reports/supply/filters${branchId ? `?branchId=${branchId}` : ''}`),
    enabled,
    staleTime: 60 * 1000,
  });
  return { cities: query.data?.cities ?? [], territories: query.data?.territories ?? [] };
}
