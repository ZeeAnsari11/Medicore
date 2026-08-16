import { TenantOwnedEntity } from './base';

export interface Manufacturer extends TenantOwnedEntity {
  name: string;
  country?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  isActive: boolean;
}

export interface CreateManufacturerRequest {
  name: string;
  country?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
}

export interface UpdateManufacturerRequest {
  name?: string;
  country?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
}

export interface UpdateManufacturerStatusRequest {
  isActive: boolean;
}
