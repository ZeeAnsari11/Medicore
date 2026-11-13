import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser, TenantRole } from '@medicore/shared-types';
import { tenantStorage } from '../tenancy/tenant-context';

export const isAdminUser = (user: AuthenticatedUser): boolean =>
  user.tenantRole === TenantRole.TENANT_SUPER_ADMIN || !!user.systemRole;

/**
 * Branch for a NEW record. The top-bar branch (X-Branch-Id) is a read filter only and never decides
 * this. Admins must name the branch in the body (400 with a `branchId` field error otherwise; the
 * branch itself is validated as existing/active/in-tenant when the document is saved). Branch users
 * always get their own branch; naming another one is a 403.
 */
export function resolveCreateBranch(user: AuthenticatedUser, bodyBranchId?: string): string {
  if (isAdminUser(user)) {
    if (!bodyBranchId) {
      throw new BadRequestException({
        statusCode: 400,
        message: ['branchId should not be empty'],
        error: 'Bad Request',
      });
    }
    return bodyBranchId;
  }
  if (!user.branchId) throw new ForbiddenException('Your account is not assigned to a branch yet');
  if (bodyBranchId && bodyBranchId !== user.branchId) {
    throw new ForbiddenException('You do not have access to that branch');
  }
  return user.branchId;
}

/**
 * Branch for a record that belongs to an existing document (a return of a sale, a payment to a
 * customer, a cash receipt for invoices): always that document's branch. A body `branchId` that names
 * another branch is rejected; a branch user can only act on documents of their own branch (404
 * otherwise, like any other foreign record).
 */
export function resolveBranchFromDocument(
  user: AuthenticatedUser,
  documentBranchId: string | undefined | null,
  notFoundMessage: string,
  bodyBranchId?: string,
): string {
  if (!isAdminUser(user) && bodyBranchId && bodyBranchId !== user.branchId) {
    throw new ForbiddenException('You do not have access to that branch');
  }
  if (!documentBranchId || (!isAdminUser(user) && documentBranchId !== user.branchId)) {
    throw new NotFoundException(notFoundMessage);
  }
  if (bodyBranchId && bodyBranchId !== documentBranchId) {
    throw new BadRequestException("branchId does not match the original document's branch");
  }
  return documentBranchId;
}

/**
 * READ scope only (lists, filters, reports): resolves which branch a request is allowed to see, given the authenticated
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
    // An explicit branch wins; otherwise the validated X-Branch-Id of this request (null = all).
    return requestedBranchId ?? tenantStorage.getStore()?.branch?.selectedBranchId ?? null;
  }

  if (requestedBranchId && requestedBranchId !== user.branchId) {
    throw new ForbiddenException('You do not have access to that branch');
  }

  if (!user.branchId) {
    throw new ForbiddenException('Your account is not assigned to a branch yet');
  }

  return user.branchId;
}
