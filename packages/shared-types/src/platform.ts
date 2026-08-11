import { Tenant } from './tenant';
import { User } from './user';
import { TenantStatus } from './enums';

export interface CreatePlatformTenantRequest {
  tenantName: string;
  adminFullName: string;
  adminEmail: string;
}

export interface CreatePlatformTenantResponse {
  tenant: Tenant;
  adminUser: User;
  temporaryPassword: string;
}

export interface UpdateTenantStatusRequest {
  status: TenantStatus;
}
