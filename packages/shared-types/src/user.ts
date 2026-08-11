import { TenantOwnedEntity } from './base';
import { SystemRole, TenantRole, UserStatus } from './enums';

export interface User extends TenantOwnedEntity {
  email: string;
  fullName: string;
  status: UserStatus;
  systemRole?: SystemRole;
  tenantRole: TenantRole;
  roleId?: string;
  role?: { id: string; name: string } | null;
}

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
  tenantRole: TenantRole;
  systemRole?: SystemRole;
}

export interface CreateUserRequest {
  email: string;
  fullName: string;
  tenantRole: TenantRole;
  roleId?: string;
}

export interface CreateUserResponse extends User {
  temporaryPassword: string;
}

export interface UpdateUserRequest {
  fullName?: string;
  tenantRole?: TenantRole;
  roleId?: string | null;
}

export interface UpdateUserStatusRequest {
  status: UserStatus;
}
