'use client';

import { keepPreviousData } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery } from '@/lib/tenant-query';

export type SsrView = 'manufacturer' | 'vendor' | 'product' | 'grouped';

export interface SsrRow {
  key: string;
  label: string;
  kind: 'manufacturer' | 'vendor' | 'product' | 'batch' | 'customer';
  unitsSold: number;
  unitsReturned: number;
  netUnits: number;
  gross: number;
  discounts: number;
  returnsValue: number;
  netSales: number;
  tax: number;
  cogs: number;
  grossProfit: number;
  marginPct: number | null;
  avgPrice: number | null;
  closingStock: number;
  voidedUnits: number;
  voidedValue: number;
  invoices: number;
  customers: number;
  opening: number;
  purchased: number;
  purchaseValue: number;
  totalStock: number;
  grossSale: number;
  bonus: number;
  netSale: number;
  netSaleValue: number;
  expBrk: number;
  transferIn: number;
  transferOut: number;
  closingQty: number;
  closingValue: number;
  closingValueCp: number;
  /** Product rows only. */
  pack?: string;
  rate?: number;
  prevNetSales?: number | null;
  changePct?: number | null;
  children?: SsrRow[];
  batches?: SsrRow[];
  customerRows?: SsrRow[];
}

export interface SsrReport {
  view: SsrView;
  from: string;
  to: string;
  returnsAttribution: 'RETURN_DATE' | 'SALE_DATE';
  canViewCost: boolean;
  totals: SsrRow;
  summary: {
    netSales: number;
    netUnits: number;
    returnsValue: number;
    grossProfit: number | null;
    marginPct: number | null;
    topManufacturer: { label: string; netSales: number } | null;
    topProduct: { label: string; netSales: number } | null;
    prevNetSales?: number | null;
    changePct?: number | null;
  };
  chart: {
    manufacturers: Array<{ label: string; netSales: number; netUnits: number }>;
    products: Array<{ label: string; netSales: number; netUnits: number }>;
  };
  rows: SsrRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  warnings: string[];
}

export interface SsrInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  voided: boolean;
  unitsSold: number;
  value: number;
  unitsReturned: number;
  returnsValue: number;
  batches: Array<{ batchNumber: string; quantity: number }>;
}

/** Query string for the API; `params` is the already-clean map built by the page from the URL. */
export const ssrQuery = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return q.toString();
};

export function useSsr(params: Record<string, string | undefined>, enabled: boolean) {
  const query = useTenantQuery({
    queryKey: ['reports', 'ssr', params],
    queryFn: () => apiFetch<SsrReport>(`/reports/ssr?${ssrQuery(params)}`),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
  return { report: query.data, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error };
}

export function useSsrInvoices(productId: string | null, params: Record<string, string | undefined>) {
  return useTenantQuery({
    queryKey: ['reports', 'ssr', 'invoices', productId, params],
    queryFn: () => apiFetch<SsrInvoice[]>(`/reports/ssr/product/${productId}/invoices?${ssrQuery(params)}`),
    enabled: !!productId,
  });
}

/** Server builds the file; PDFs open in a tab opened before the await so the browser does not block it. */
export function useSsrExport() {
  return async (params: Record<string, string | undefined>, format: 'xlsx' | 'csv' | 'pdf', filename: string) => {
    const tab = format === 'pdf' ? window.open('', '_blank') : null;
    try {
      const blob = await apiFetchBlob(`/reports/ssr/export?${ssrQuery({ ...params, format })}`);
      const url = URL.createObjectURL(blob);
      if (tab) {
        tab.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      tab?.close();
      toast.error(err instanceof ApiError ? err.message : 'Export failed');
    }
  };
}
