import { TenantOwnedEntity } from './base';

export interface VendorProduct extends TenantOwnedEntity {
  vendorId: string;
  vendor?: { id: string; company: string };
  productId: string;
  product?: { id: string; name: string };
  vendorSku?: string;
  purchasePrice: number;
  isPreferred: boolean;
  isActive: boolean;
}

export interface CreateVendorProductRequest {
  vendorId: string;
  productId: string;
  vendorSku?: string;
  purchasePrice: number;
  isPreferred?: boolean;
}

export interface UpdateVendorProductRequest {
  vendorSku?: string;
  purchasePrice?: number;
  isPreferred?: boolean;
  isActive?: boolean;
}
