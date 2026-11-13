'use client';

import { Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@medicore/ui';
import type { BranchFilterState } from '@/hooks/use-branch-filter';

const ALL_BRANCHES = '__all__';

/** Branch dropdown for admins, read-only label for branch users, nothing for a single-branch admin. */
export function BranchFilter({
  filter,
  allowAll = true,
  disabled,
  viewing,
}: {
  filter: BranchFilterState;
  allowAll?: boolean;
  disabled?: boolean;
  /** Prefix the control with "Viewing:" (the top bar's branch is a read filter, never where records are created). */
  viewing?: boolean;
}) {
  if (filter.lockedBranchName) {
    return <Badge variant="outline">{viewing ? 'Viewing' : 'Branch'}: {filter.lockedBranchName}</Badge>;
  }
  if (!filter.showDropdown) return null;
  const select = (
    <Select
      value={filter.branchId ?? (allowAll ? ALL_BRANCHES : '')}
      disabled={disabled}
      onValueChange={(value) => filter.setBranchId(value === ALL_BRANCHES ? null : value)}
    >
      <SelectTrigger className="w-48" aria-label="Branch">
        <SelectValue placeholder="Select branch" />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>}
        {filter.branches.map((branch) => (
          <SelectItem key={branch.id} value={branch.id}>
            {branch.isMain ? `${branch.name} (Main)` : branch.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  if (!viewing) return select;
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Viewing:</span>
      {select}
    </div>
  );
}
