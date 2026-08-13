import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthResponse, AuthMeResponse, LoginRequest } from '@medicore/shared-types';
import { apiFetch, getStoredToken, setStoredToken } from '@/lib/api-client';

export const AUTH_QUERY_KEY = ['auth', 'me'];

async function fetchCurrentUser(): Promise<AuthMeResponse | null> {
  if (!getStoredToken()) return null;
  try {
    return await apiFetch<AuthMeResponse>('/auth/me');
  } catch {
    setStoredToken(null);
    return null;
  }
}

export function useAuth() {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (input: LoginRequest) => {
      const authResponse = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: input,
        auth: false,
      });
      setStoredToken(authResponse.accessToken);
      // Fetch full user data with permissions from /auth/me
      const fullUser = await apiFetch<AuthMeResponse>('/auth/me');
      return fullUser;
    },
    onSuccess: (fullUser) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, fullUser);
    },
  });

  const logout = () => {
    setStoredToken(null);
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
    queryClient.clear();
  };

  return {
    user: meQuery.data ?? null,
    isLoading: meQuery.isLoading,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    logout,
  };
}
