/**
 * SaaS-level role: applies to Medicore's own operators, not tenant staff.
 */
export enum SystemRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
}

/**
 * Tenant-scoped roles. Extend this as tenant RBAC grows (e.g. INVENTORY_MANAGER,
 * SALES_REP) — keep it a flat enum so permission checks stay simple to reason about.
 * TENANT_SUPER_ADMIN: the fixed, non-deletable per-tenant owner. Implicit admin (all permissions).
 * TENANT_USER: ordinary tenant user, subject to role-based permissions.
 */
export enum TenantRole {
  TENANT_SUPER_ADMIN = 'TENANT_SUPER_ADMIN',
  TENANT_USER = 'TENANT_USER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INVITED = 'INVITED',
  DISABLED = 'DISABLED',
}

export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  TRIAL = 'TRIAL',
}
