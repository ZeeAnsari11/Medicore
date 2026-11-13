import type { QueryClient } from '@tanstack/react-query';

const PRESERVED_KEYS = new Set(['theme']);

/**
 * Wipes everything a previous identity could have left behind: the whole query cache plus
 * local/session storage (except UI prefs). Call on login, logout and session expiry.
 */
export function resetClientState(queryClient: QueryClient) {
  queryClient.clear();
  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (!PRESERVED_KEYS.has(key)) storage.removeItem(key);
      }
    }
  } catch {
    // storage can be unavailable; the cache is already cleared
  }
}
