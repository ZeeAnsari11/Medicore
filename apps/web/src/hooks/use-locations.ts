'use client';

import { useMutation } from '@tanstack/react-query';
import type {
  City,
  CreateCityRequest,
  CreateTerritoryRequest,
  Territory,
  UpdateCityRequest,
  UpdateTerritoryRequest,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';
import { CUSTOMERS_QUERY_KEY } from '@/hooks/use-customers';

export const CITIES_QUERY_KEY = ['locations', 'cities'];
export const TERRITORIES_QUERY_KEY = ['locations', 'territories'];

const failure = (fallback: string) => (error: unknown) => toast.error(error instanceof ApiError ? error.message : fallback);

/**
 * A branch's city and territory lists (customers keep the names as text). `branchId` names the branch explicitly (the
 * customer form's own Branch field); left out, the lists follow the top-bar branch ("All branches" lists every branch).
 */
export function useLocations(enabled = true, branchId?: string | null) {
  const query = branchId ? `?branchId=${branchId}` : '';
  const queryClient = useTenantQueryClient();

  const citiesQuery = useTenantQuery({
    queryKey: [...CITIES_QUERY_KEY, branchId ?? null],
    queryFn: () => apiFetch<City[]>(`/locations/cities${query}`),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
  const territoriesQuery = useTenantQuery({
    queryKey: [...TERRITORIES_QUERY_KEY, branchId ?? null],
    queryFn: () => apiFetch<Territory[]>(`/locations/territories${query}`),
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: CITIES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: TERRITORIES_QUERY_KEY });
    // Renaming a place renames it on the customers using it.
    void queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['reports', 'supply-filters'] });
  };

  const createCity = useMutation({
    mutationFn: (dto: CreateCityRequest) => apiFetch<City>('/locations/cities', { method: 'POST', body: dto }),
    onSuccess: () => {
      refresh();
      toast.success('City created');
    },
    onError: failure('Failed to create city'),
  });
  const createTerritory = useMutation({
    mutationFn: (dto: CreateTerritoryRequest) => apiFetch<Territory>('/locations/territories', { method: 'POST', body: dto }),
    onSuccess: () => {
      refresh();
      toast.success('Territory created');
    },
    onError: failure('Failed to create territory'),
  });
  const updateCity = useMutation({
    mutationFn: ({ id, ...dto }: UpdateCityRequest & { id: string }) => apiFetch<City>(`/locations/cities/${id}`, { method: 'PATCH', body: dto }),
    onSuccess: refresh,
    onError: failure('Failed to update city'),
  });
  const updateTerritory = useMutation({
    mutationFn: ({ id, ...dto }: UpdateTerritoryRequest & { id: string }) =>
      apiFetch<Territory>(`/locations/territories/${id}`, { method: 'PATCH', body: dto }),
    onSuccess: refresh,
    onError: failure('Failed to update territory'),
  });

  return {
    cities: citiesQuery.data ?? [],
    territories: territoriesQuery.data ?? [],
    isLoading: citiesQuery.isLoading || territoriesQuery.isLoading,
    createCity: createCity.mutateAsync,
    isCreatingCity: createCity.isPending,
    createTerritory: createTerritory.mutateAsync,
    isCreatingTerritory: createTerritory.isPending,
    updateCity: updateCity.mutateAsync,
    updateTerritory: updateTerritory.mutateAsync,
  };
}
