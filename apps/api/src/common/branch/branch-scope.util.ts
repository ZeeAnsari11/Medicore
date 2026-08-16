import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser, TenantRole } from '@medicore/shared-types';

/**
 * Resolves which branch a request is allowed to see, given the authenticated
 * user and an optional client-requested branchId (e.g. `?branchId=`).
 *
 * Unlike tenantId, branchId is not an unconditional filter — a TENANT_SUPER_ADMIN
 * (or SUPER_ADMIN) may legitimately view a specific branch or all of them. This
 * is the one place that decision is made, so no controller can forget it or get
 * it wrong independently.
 *
 * Returns the branchId to filter by, or `null` to mean "all branches" (only ever
 * returned for an admin who omitted a requested branch).
 */
export function resolveBranchScope(
  user: AuthenticatedUser,
  requestedBranchId?: string,
): string | null {
  const isAdmin = user.tenantRole === TenantRole.TENANT_SUPER_ADMIN || !!user.systemRole;

  if (isAdmin) {
    return requestedBranchId ?? null;
  }

  if (requestedBranchId && requestedBranchId !== user.branchId) {
    throw new ForbiddenException('You do not have access to that branch');
  }

  if (!user.branchId) {
    throw new ForbiddenException('Your account is not assigned to a branch yet');
  }

  return user.branchId;
}
