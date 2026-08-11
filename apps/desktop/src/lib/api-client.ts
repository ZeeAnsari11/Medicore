import { createApiClient, type TokenStorage } from '@medicore/api-client';

export { ApiError } from '@medicore/api-client';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
const TOKEN_STORAGE_KEY = 'medicore_access_token';

// Tauri's webview supports window.localStorage the same as a browser would.
const localStorageTokenStorage: TokenStorage = {
  getToken: () => window.localStorage.getItem(TOKEN_STORAGE_KEY),
  setToken: (token) => {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  },
};

export const { apiFetch } = createApiClient({
  baseUrl: API_BASE_URL,
  tokenStorage: localStorageTokenStorage,
});
