'use client';

import { useCallback, useEffect } from 'react';
import { useAuth } from './use-auth';
import { useBranches } from './use-branches';
import { usePermissions } from './use-permissions';
import {
  ALL_BRANCHES_VALUE,
  useBranchSelection,
  writeBranchSelection,
} from '@/lib/branch-selection';

/**
 * The branch a list page is scoped to.
 * - Branch users are locked to their own branch (no dropdown, no "all").
 * - Admins default to "All branches" and may switch to a single branch; the choice is remembered for
 *   the session (sessionStorage is wiped on login/logout by `resetClientState`) and is what the API
 *   receives as `X-Branch-Id`.
 * - An admin with a single branch is locked to it. The server enforces the same rules.
 * - `urlBranch` (a `?branch=` link) seeds the remembered choice.
 */
export function useBranchFilter(urlBranch?: string) {
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const { branches } = useBranches();
  const stored = useBranchSelection();

  useEffect(() => {
    if (urlBranch && isAdmin && urlBranch !== stored) writeBranchSelection(urlBranch);
  }, [urlBranch, isAdmin, stored]);

  const setBranchId = useCallback((id: string | null) => writeBranchSelection(id ?? ALL_BRANCHES_VALUE), []);

  const lockedAdminBranch = isAdmin && branches.length === 1 ? branches[0] : undefined;

  let branchId: string | null;
  if (!isAdmin) branchId = user?.branchId ?? null;
  else if (lockedAdminBranch) branchId = lockedAdminBranch.id;
  else if (stored && stored !== ALL_BRANCHES_VALUE && branches.some((b) => b.id === stored)) branchId = stored;
  else branchId = null;

  // Persist the resolved default so API calls (header) and query keys agree with what the page shows.
  useEffect(() => {
    if (isAdmin && branchId && stored !== branchId) writeBranchSelection(branchId);
  }, [isAdmin, branchId, stored]);

  return {
    branchId,
    setBranchId,
    /** True only for an admin viewing every branch combined. */
    isAll: isAdmin && branchId === null,
    showDropdown: isAdmin && branches.length > 1,
    branches,
    /** Branch users: their own branch name, for the read-only label. */
    lockedBranchName: isAdmin ? null : (branches.find((b) => b.id === user?.branchId)?.name ?? 'Unassigned branch'),
  };
}

export type BranchFilterState = ReturnType<typeof useBranchFilter>;
