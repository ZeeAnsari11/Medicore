'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export const AVAILABLE_MODULES_QUERY_KEY = ['available-modules'];

interface ModuleOption {
  id: string;
  label: string;
}

async function fetchAvailableModules(): Promise<ModuleOption[]> {
  return apiFetch<ModuleOption[]>('/roles/modules/available');
}

export function useAvailableModules() {
  const modulesQuery = useQuery({
    queryKey: AVAILABLE_MODULES_QUERY_KEY,
    queryFn: fetchAvailableModules,
    staleTime: 60 * 60 * 1000, // 1 hour — modules change rarely
  });

  return {
    modules: modulesQuery.data ?? [],
    isLoading: modulesQuery.isLoading,
    error: modulesQuery.error,
  };
}
