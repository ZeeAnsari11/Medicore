import { TenantOwnedEntity } from './base';

export interface PermissionSummary {
  id: string;
  key: string;
  name: string;
  module: string;
  isActive: boolean;
}

export interface Role extends TenantOwnedEntity {
  name: string;
  description?: string;
  permissions: PermissionSummary[];
  isActive: boolean;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissionIds: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissionIds?: string[];
}

export interface UpdateRoleStatusRequest {
  isActive: boolean;
}
