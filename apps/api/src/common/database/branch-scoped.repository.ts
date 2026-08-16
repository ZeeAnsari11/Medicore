import { FilterQuery, Types } from 'mongoose';
import { TenantScopedRepository } from './tenant-scoped.repository';

/**
 * Base for tenant-owned collections that are additionally scoped to a branch
 * (Batch, StockMovement, Purchase, Sale, StockTransfer, …).
 *
 * Unlike tenantId, branchId is not an unconditional filter: a `null` branchId
 * means "all branches" (an admin viewing org-wide data), which is a legitimate
 * query, not a leak. Callers must resolve and authorize that decision themselves
 * (see `resolveBranchScope` in `common/branch/branch-scope.util.ts`) — this class
 * only merges whatever branchId it's given, it never infers or defaults one.
 */
export abstract class BranchScopedRepository<
  TDoc extends { tenantId: Types.ObjectId; branchId: Types.ObjectId },
> extends TenantScopedRepository<TDoc> {
  protected withBranch(
    branchId: string | null,
    filter: FilterQuery<TDoc> = {},
  ): FilterQuery<TDoc> {
    if (branchId === null) {
      return filter;
    }
    return { ...filter, branchId: new Types.ObjectId(branchId) };
  }

  /** Combines tenant + (optional) branch scoping in one call for subclass queries. */
  protected withTenantAndBranch(
    tenantId: string,
    branchId: string | null,
    filter: FilterQuery<TDoc> = {},
  ): FilterQuery<TDoc> {
    return this.withTenant(tenantId, this.withBranch(branchId, filter));
  }
}
