'use client';

import { useState } from 'react';
import { useBranchFilter } from './use-branch-filter';

/**
 * The branch a NEW record is created in, as a form field. The top-bar branch is a read filter only and
 * never pre-selects it; the form's own value is what gets sent as `branchId`. Branch users and
 * single-branch admins have no choice: the field is pre-filled and locked.
 */
export function useBranchField() {
  const filter = useBranchFilter();
  const locked = !filter.showDropdown && !!filter.branchId;
  return {
    /** Initial form value: the locked branch, or '' so admins pick explicitly. */
    defaultBranchId: locked ? (filter.branchId ?? '') : '',
    locked,
    branches: filter.branches,
    lockedBranchName: filter.branches.find((b) => b.id === filter.branchId)?.name ?? filter.lockedBranchName ?? '',
  };
}

export type BranchFieldState = ReturnType<typeof useBranchField>;

/**
 * Branch value for state-driven create dialogs. `require()` flags the inline "Branch is required" error
 * instead of letting the API reject it. Admins pick explicitly unless the form opts in with `preselect`,
 * which fills the main branch, else the only branch (the admin can still change it). The branch being viewed in the
 * top bar never decides where a new record goes.
 */
export function useBranchFieldValue(open: boolean, { preselect = false }: { preselect?: boolean } = {}) {
  const field = useBranchField();
  // `picked` is null until the user chooses; until then the field shows the default. Derived at render, not
  // stored, because the branch list loads asynchronously.
  const [picked, setPicked] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPicked(null);
      setTouched(false);
    }
  }
  const autoBranchId = preselect
    ? (field.branches.find((b) => b.isMain)?.id ?? (field.branches.length === 1 ? field.branches[0].id : ''))
    : '';
  const value = picked ?? (field.defaultBranchId || autoBranchId);

  return {
    field,
    value,
    setValue: setPicked,
    error: touched && !value ? 'Branch is required' : undefined,
    require: () => {
      if (value) return true;
      setTouched(true);
      return false;
    },
  };
}
