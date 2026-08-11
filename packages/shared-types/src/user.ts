import { TenantOwnedEntity } from './base';
import { SystemRole, TenantRole, UserStatus } from './enums';

export interface User extends TenantOwnedEntity {
  email: string;
  fullName: string;
  status: UserStatus;
  systemRole?: SystemRole;
  tenantRole: TenantRole;
}

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
  tenantRole: TenantRole;
  systemRole?: SystemRole;
}
