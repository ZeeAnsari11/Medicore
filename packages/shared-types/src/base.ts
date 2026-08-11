export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Every tenant-owned document carries tenantId. Never trust a client-supplied
 * tenantId — it must always be derived server-side from the authenticated session.
 */
export interface TenantOwnedEntity extends BaseEntity {
  tenantId: string;
}
