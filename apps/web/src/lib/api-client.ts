import { createApiClient, type TokenStorage } from '@medicore/api-client';

export { ApiError } from '@medicore/api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const TOKEN_STORAGE_KEY = 'medicore_access_token';

const localStorageTokenStorage: TokenStorage = {
  getToken: () => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  },
  setToken: (token) => {
    if (typeof window === 'undefined') return;
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  },
};

const client = createApiClient({ baseUrl: API_BASE_URL, tokenStorage: localStorageTokenStorage });

export const apiFetch = client.apiFetch;
export const getStoredToken = () => localStorageTokenStorage.getToken();
export const setStoredToken = (token: string | null) => localStorageTokenStorage.setToken(token);
