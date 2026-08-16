import { TenantOwnedEntity } from './base';
import { ProductStatus } from './enums';

export interface Product extends TenantOwnedEntity {
  name: string;
  genericName?: string;
  manufacturerId: string;
  manufacturer?: { id: string; name: string };
  categoryId?: string;
  category?: { id: string; name: string };
  barcode?: string;
  unit: string;
  packing?: string;
  purchasePrice: number;
  salePrice: number;
  dealerPrice?: number;
  status: ProductStatus;
  minStockLevel?: number;
}

export interface CreateProductRequest {
  name: string;
  genericName?: string;
  manufacturerId: string;
  categoryId?: string;
  barcode?: string;
  unit: string;
  packing?: string;
  purchasePrice: number;
  salePrice: number;
  dealerPrice?: number;
  minStockLevel?: number;
}

export interface UpdateProductRequest {
  name?: string;
  genericName?: string;
  manufacturerId?: string;
  categoryId?: string;
  barcode?: string;
  unit?: string;
  packing?: string;
  purchasePrice?: number;
  salePrice?: number;
  dealerPrice?: number;
  minStockLevel?: number;
}

export interface UpdateProductStatusRequest {
  status: ProductStatus;
}
