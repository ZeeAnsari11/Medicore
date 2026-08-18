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

export enum PlanStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum BillingInterval {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  DISCONTINUED = 'DISCONTINUED',
}

export enum StockMovementType {
  PURCHASE_IN = 'PURCHASE_IN',
  SALE_OUT = 'SALE_OUT',
  TRANSFER_OUT = 'TRANSFER_OUT',
  TRANSFER_IN = 'TRANSFER_IN',
  ADJUSTMENT_ADD = 'ADJUSTMENT_ADD',
  ADJUSTMENT_SUBTRACT = 'ADJUSTMENT_SUBTRACT',
  ADJUSTMENT_SET = 'ADJUSTMENT_SET',
}

/** Batch-allocation strategy for a sale line item — FEFO by default, MANUAL as an override. */
export enum AllocationMode {
  FEFO = 'FEFO',
  MANUAL = 'MANUAL',
}

export enum PurchaseStatus {
  DRAFT = 'DRAFT',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

/** Shared by Purchase and Sale. */
export enum PaymentStatus {
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  UNPAID = 'UNPAID',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  CREDIT = 'CREDIT',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

