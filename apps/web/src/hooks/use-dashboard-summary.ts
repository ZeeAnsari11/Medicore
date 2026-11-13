'use client';

import { keepPreviousData } from '@tanstack/react-query';
import type { DashboardSummary } from '@medicore/shared-types';
import { apiFetch } from '@/lib/api-client';
import { useTenantQuery } from '@/lib/tenant-query';

export function useDashboardSummary(branchId: string | null) {
  return useTenantQuery({
    queryKey: ['dashboard', 'summary', branchId],
    queryFn: () => {
      // "Today" is the viewer's local day, not the server's.
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const params = new URLSearchParams({ todayStart: start.toISOString(), todayEnd: end.toISOString() });
      if (branchId) params.set('branchId', branchId);
      return apiFetch<DashboardSummary>(`/reports/dashboard-summary?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
}
