import { ApiError, createApiClient, type ApiRequestOptions, type TokenStorage } from '@medicore/api-client';

import { branchHeaders } from '@/lib/branch-selection';
import { clearBrowserStorage } from '@/lib/session-reset';

export { ApiError } from '@medicore/api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const TOKEN_STORAGE_KEY = 'medicore_access_token';
// Impersonation lives in sessionStorage so it stays in its own tab and never overwrites the super admin's session.
export const IMPERSONATION_TOKEN_KEY = 'medicore_impersonation_token';

const localStorageTokenStorage: TokenStorage = {
  getToken: () => {
    if (typeof window === 'undefined') return null;
    return (
      window.sessionStorage.getItem(IMPERSONATION_TOKEN_KEY) ??
      window.localStorage.getItem(TOKEN_STORAGE_KEY)
    );
  },
  setToken: (token) => {
    if (typeof window === 'undefined') return;
    if (window.sessionStorage.getItem(IMPERSONATION_TOKEN_KEY)) {
      if (!token) window.sessionStorage.removeItem(IMPERSONATION_TOKEN_KEY);
      return;
    }
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  },
};

const client = createApiClient({ baseUrl: API_BASE_URL, tokenStorage: localStorageTokenStorage });

/** An authenticated request came back 401: the token is expired or invalid, so send the user to sign in again. */
function expireSession() {
  if (typeof window === 'undefined') return;
  clearBrowserStorage();
  if (window.location.pathname !== '/login') window.location.assign('/login');
}

async function withSessionExpiry<T>(request: Promise<T>, options?: ApiRequestOptions): Promise<T> {
  try {
    return await request;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && options?.auth !== false) expireSession();
    throw err;
  }
}

/**
 * Authenticated reads carry the admin's selected branch (X-Branch-Id) as a filter; the server validates it
 * (branch users are forced to theirs). Creates (POST) never send it: a new record's branch comes from the
 * form's own `branchId` field, so the top-bar selection can't decide where it lands.
 */
const withBranch = (options?: ApiRequestOptions): ApiRequestOptions | undefined =>
  options?.auth === false || options?.method === 'POST'
    ? options
    : { ...options, headers: { ...branchHeaders(), ...(options?.headers as Record<string, string>) } };

export const apiFetch = <T>(path: string, options?: ApiRequestOptions) =>
  withSessionExpiry(client.apiFetch<T>(path, withBranch(options)), options);
export const apiFetchBlob = (path: string, options?: ApiRequestOptions) =>
  withSessionExpiry(client.apiFetchBlob(path, withBranch(options)), options);
export const getStoredToken = () => localStorageTokenStorage.getToken();
export const getApiBaseUrl = () => API_BASE_URL;
export const setStoredToken = (token: string | null) => localStorageTokenStorage.setToken(token);
