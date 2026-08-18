// Explicit re-exports, not `export *`: enums below are real runtime values (TS
// `enum` compiles to an object), and production bundlers (Rollup/Vite) can't
// always statically resolve named exports through TypeScript's CommonJS
// `export *` helper. The other files are type-only and erase at compile time,
// so they're safe either way, but kept explicit here for consistency.
export { SystemRole, TenantRole, UserStatus, TenantStatus, PlanStatus, BillingInterval, SubscriptionStatus, ProductStatus, StockMovementType, AllocationMode, PurchaseStatus, PaymentStatus, PaymentMethod } from './enums';
export type { BaseEntity, TenantOwnedEntity, BranchOwnedEntity } from './base';
export type { Tenant } from './tenant';
export type { Branch, CreateBranchRequest, UpdateBranchRequest, UpdateBranchStatusRequest } from './branch';
export type { Manufacturer, CreateManufacturerRequest, UpdateManufacturerRequest, UpdateManufacturerStatusRequest } from './manufacturer';
export type { Category, CreateCategoryRequest, UpdateCategoryRequest, UpdateCategoryStatusRequest } from './category';
export type { Product, CreateProductRequest, UpdateProductRequest, UpdateProductStatusRequest } from './product';
export type { Vendor, CreateVendorRequest, UpdateVendorRequest, UpdateVendorStatusRequest } from './vendor';
export type { VendorProduct, CreateVendorProductRequest, UpdateVendorProductRequest } from './vendor-product';
export type { Batch, CreateBatchAdjustmentRequest, InventoryRollup } from './batch';
export type { StockMovement } from './stock-movement';
export type {
  Purchase,
  PurchaseItem,
  CreatePurchaseRequest,
  CreatePurchaseItemRequest,
  UpdatePurchasePaymentRequest,
} from './purchase';
export type { Customer, CreateCustomerRequest, UpdateCustomerRequest } from './customer';
export type {
  Sale,
  SaleItem,
  SaleBatchAllocation,
  CreateSaleRequest,
  CreateSaleItemRequest,
  UpdateSalePaymentRequest,
} from './sale';
export type { Permission, CreatePermissionRequest, UpdatePermissionRequest, UpdatePermissionStatusRequest } from './permission';
export type { Role, CreateRoleRequest, UpdateRoleRequest, UpdateRoleStatusRequest } from './role';
export type { User, CreateUserRequest, CreateUserResponse, UpdateUserRequest, UpdateUserStatusRequest, AuthenticatedUser } from './user';
export type { LoginRequest, AuthResponse, AuthMeResponse } from './auth';
export type { CreatePlatformTenantRequest, CreatePlatformTenantResponse, UpdateTenantStatusRequest, UpdateTenantRequest, PlatformDashboardSummary } from './platform';
export type { Plan, CreatePlanRequest, UpdatePlanRequest, UpdatePlanStatusRequest } from './plan';
export type { Subscription, SubscriptionWithDetails, AssignSubscriptionPlanRequest, UpdateSubscriptionStatusRequest } from './subscription';
export type { PlatformSettings, UpdatePlatformSettingsRequest } from './platform-settings';
