'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlatformSettings, UpdatePlatformSettingsRequest } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';

export const PLATFORM_SETTINGS_QUERY_KEY = ['platform', 'settings'];

async function fetchSettings(): Promise<PlatformSettings> {
  return apiFetch<PlatformSettings>('/platform/settings');
}

async function updateSettings(dto: UpdatePlatformSettingsRequest): Promise<PlatformSettings> {
  return apiFetch<PlatformSettings>('/platform/settings', { method: 'PATCH', body: dto });
}

export function usePlatformSettings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: PLATFORM_SETTINGS_QUERY_KEY,
    queryFn: fetchSettings,
    staleTime: 5 * 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(PLATFORM_SETTINGS_QUERY_KEY, settings);
      toast.success('Settings saved');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to save settings');
    },
  });

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    error: settingsQuery.error,
    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
