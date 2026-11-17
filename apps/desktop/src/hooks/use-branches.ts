import type { Branch } from '@medicore/shared-types';
import { apiFetch } from '@/lib/api-client';
import { useTenantQuery } from '@/lib/tenant-query';

export const BRANCHES_QUERY_KEY = ['branches'];

async function fetchBranches(): Promise<Branch[]> {
  return apiFetch<Branch[]>('/branches');
}

export function useBranches() {
  const branchesQuery = useTenantQuery({
    queryKey: BRANCHES_QUERY_KEY,
    queryFn: fetchBranches,
    staleTime: 5 * 60 * 1000,
  });

  return {
    branches: branchesQuery.data ?? [],
    isLoading: branchesQuery.isLoading,
    error: branchesQuery.error,
  };
}
