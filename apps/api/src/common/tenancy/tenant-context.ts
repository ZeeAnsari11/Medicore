import { AsyncLocalStorage } from 'async_hooks';

/** Branch visibility for the current request, resolved by TenantContextGuard from the DB user. */
export interface BranchContext {
  /** Admin (tenant super admin / platform admin): may select any branch of the tenant, or all. */
  canSeeAll: boolean;
  /** The one branch in force: forced for branch users, the validated `X-Branch-Id` for admins. */
  selectedBranchId?: string;
  /** Branch ids already confirmed as active branches of this tenant (create-time cache). */
  validBranchIds?: Set<string>;
}

export interface TenantStore {
  /** Tenant of the authenticated caller, set from the verified JWT only. */
  tenantId?: string;
  /** True only inside an explicit cross-tenant escape hatch. */
  bypass?: boolean;
  /** Branch scope; branch-owned models fail closed when it is missing (see branch-scope.plugin). */
  branch?: BranchContext;
  /** True only inside runWithoutBranchScope(). */
  branchBypass?: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

/**
 * Escape hatch: run `fn` with tenant scoping disabled. Only for super-admin
 * (platform) code, pre-auth lookups such as login, and bootstrap seeders.
 */
export const runWithoutTenantScope = <T>(fn: () => T): T =>
  tenantStorage.run({ bypass: true }, fn);

/**
 * Escape hatch: keep tenant scoping but drop branch scoping. Only for migrations, super admin
 * tooling and main-branch resolution; never for request handlers.
 */
export const runWithoutBranchScope = <T>(fn: () => T): T =>
  tenantStorage.run({ ...(tenantStorage.getStore() ?? {}), branchBypass: true }, fn);

/**
 * Run `fn` scoped to `tenantId` (scripts, tests, background work). Sees every branch unless
 * `branchId` is given.
 */
export const runAsTenant = <T>(tenantId: string, fn: () => T, branchId?: string): T =>
  tenantStorage.run({ tenantId, branch: { canSeeAll: !branchId, selectedBranchId: branchId } }, fn);
