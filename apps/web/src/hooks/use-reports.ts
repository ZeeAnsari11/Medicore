'use client';

import type { SalesReport, InventoryReport } from '@medicore/shared-types';
import { apiFetch } from '@/lib/api-client';
import { useTenantQuery } from '@/lib/tenant-query';

export const SALES_REPORT_QUERY_KEY = ['reports', 'sales'];
export const INVENTORY_REPORT_QUERY_KEY = ['reports', 'inventory'];

async function fetchSalesReport(branchId: string | null, startDate?: string, endDate?: string): Promise<SalesReport> {
  const params = new URLSearchParams();
  if (branchId) params.set('branchId', branchId);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const query = params.toString();
  return apiFetch<SalesReport>(`/reports/sales${query ? `?${query}` : ''}`);
}

async function fetchInventoryReport(
  branchId: string | null,
  search?: string,
  startDate?: string,
  endDate?: string,
): Promise<InventoryReport> {
  const params = new URLSearchParams();
  if (branchId) params.set('branchId', branchId);
  if (search) params.set('search', search);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const query = params.toString();
  return apiFetch<InventoryReport>(`/reports/inventory${query ? `?${query}` : ''}`);
}

export function useSalesReport(branchId: string | null, startDate?: string, endDate?: string) {
  const query = useTenantQuery({
    queryKey: [...SALES_REPORT_QUERY_KEY, branchId, startDate, endDate],
    queryFn: () => fetchSalesReport(branchId, startDate, endDate),
    staleTime: 30 * 1000,
  });
  return { report: query.data, isLoading: query.isLoading, error: query.error };
}

export function useInventoryReport(
  branchId: string | null,
  search?: string,
  startDate?: string,
  endDate?: string,
) {
  const query = useTenantQuery({
    queryKey: [...INVENTORY_REPORT_QUERY_KEY, branchId, search, startDate, endDate],
    queryFn: () => fetchInventoryReport(branchId, search, startDate, endDate),
    staleTime: 30 * 1000,
  });
  return { report: query.data, isLoading: query.isLoading, error: query.error };
}

