import type { QueryClient } from '@tanstack/react-query';

const PRESERVED_KEYS = new Set(['theme']);
const AUTH_TOKEN_KEY = 'medicore_access_token';

/**
 * Wipes everything a previous identity could have left behind: the whole query cache plus
 * local/session storage (except UI prefs). Call on login, logout, session expiry and on
 * impersonation start/exit.
 *
 * `keepSuperAdminSession` is for impersonation start/exit: localStorage is shared across tabs and
 * holds the super admin's own token, so wiping it would sign the admin out of their other tabs.
 * The impersonation token itself only lives in this tab's sessionStorage.
 */
export function resetClientState(queryClient: QueryClient, opts: { keepSuperAdminSession?: boolean } = {}) {
  queryClient.clear();
  clearBrowserStorage(opts);
}

/** Storage half of the reset, for places without a QueryClient (a hard navigation drops the cache anyway). */
export function clearBrowserStorage(opts: { keepSuperAdminSession?: boolean } = {}) {
  if (typeof window === 'undefined') return;
  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (PRESERVED_KEYS.has(key)) continue;
        if (opts.keepSuperAdminSession && storage === window.localStorage && key === AUTH_TOKEN_KEY) continue;
        storage.removeItem(key);
      }
    }
  } catch {
    // storage can be unavailable (private mode); the cache is already cleared
  }
}
