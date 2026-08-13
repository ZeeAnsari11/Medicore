'use client';

import { useQuery } from '@tanstack/react-query';
import type { PlatformDashboardSummary } from '@medicore/shared-types';
import { apiFetch } from '@/lib/api-client';

export const PLATFORM_DASHBOARD_QUERY_KEY = ['platform', 'dashboard'];

async function fetchDashboardSummary(): Promise<PlatformDashboardSummary> {
  return apiFetch<PlatformDashboardSummary>('/platform/dashboard');
}

export function usePlatformDashboard() {
  const dashboardQuery = useQuery({
    queryKey: PLATFORM_DASHBOARD_QUERY_KEY,
    queryFn: fetchDashboardSummary,
    staleTime: 60 * 1000,
  });

  return {
    summary: dashboardQuery.data,
    isLoading: dashboardQuery.isLoading,
    isError: dashboardQuery.isError,
  };
}
