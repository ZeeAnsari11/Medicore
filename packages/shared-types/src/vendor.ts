import { TenantOwnedEntity } from './base';

export interface Vendor extends TenantOwnedEntity {
  company: string;
  distributorType?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  isActive: boolean;
}

export interface CreateVendorRequest {
  company: string;
  distributorType?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
}

export interface UpdateVendorRequest {
  company?: string;
  distributorType?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
}

export interface UpdateVendorStatusRequest {
  isActive: boolean;
}
