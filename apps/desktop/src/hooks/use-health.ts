import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface HealthResponse {
  status: string;
  timestamp: string;
  mongo: 'connected' | 'connecting' | 'disconnected' | 'disconnecting' | 'unknown';
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthResponse>('/health', { auth: false }),
    refetchInterval: 30_000,
    retry: false,
  });
}
