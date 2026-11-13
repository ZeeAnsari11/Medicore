'use client';

import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@medicore/ui';
import type { BranchFieldState } from '@/hooks/use-branch-field';

/** Required Branch field for create forms. Locked (read-only) for branch users and single-branch admins. */
export function BranchField({
  field,
  value,
  onChange,
  error,
  id = 'branchId',
}: {
  field: BranchFieldState;
  value: string;
  onChange: (branchId: string) => void;
  error?: string;
  id?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        Branch <span className="text-destructive">*</span>
      </Label>
      {field.locked ? (
        <Input id={id} value={field.lockedBranchName} disabled readOnly />
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} aria-label="Branch" aria-invalid={!!error}>
            <SelectValue placeholder="Select branch" />
          </SelectTrigger>
          <SelectContent>
            {field.branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.isMain ? `${b.name} (Main)` : b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
