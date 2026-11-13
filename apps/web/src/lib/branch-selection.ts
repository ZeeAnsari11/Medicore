import { useSyncExternalStore } from 'react';

/**
 * The admin's selected branch ('all' or a branch id), remembered for the session. It is sent as
 * `X-Branch-Id` on every API call and is part of every query key, so switching branches can never
 * show another branch's cached data. Cleared on login/logout by `resetClientState`.
 */
// v2: a new key so selections remembered when the default was the main branch reset to "All branches".
export const BRANCH_SELECTION_KEY = 'branchFilter.v2';
export const ALL_BRANCHES_VALUE = 'all';
const CHANGE_EVENT = 'branch-filter-change';

export function readBranchSelection(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(BRANCH_SELECTION_KEY);
  } catch {
    return null; // storage unavailable
  }
}

export function writeBranchSelection(value: string) {
  try {
    window.sessionStorage.setItem(BRANCH_SELECTION_KEY, value);
  } catch {
    // not persisted
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

export const useBranchSelection = () => useSyncExternalStore(subscribe, readBranchSelection, () => null);

/** Header for the API: a specific branch id, or nothing for "all branches". */
export function branchHeaders(): Record<string, string> {
  const value = readBranchSelection();
  return value && value !== ALL_BRANCHES_VALUE ? { 'X-Branch-Id': value } : {};
}
