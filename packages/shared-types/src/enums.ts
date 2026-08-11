/**
 * SaaS-level role: applies to Medicore's own operators, not tenant staff.
 */
export enum SystemRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
}

/**
 * Tenant-scoped roles. Extend this as tenant RBAC grows (e.g. INVENTORY_MANAGER,
 * SALES_REP) — keep it a flat enum so permission checks stay simple to reason about.
 */
export enum TenantRole {
  TENANT_ADMIN = 'TENANT_ADMIN',
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
