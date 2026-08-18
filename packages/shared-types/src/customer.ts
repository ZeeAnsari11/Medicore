import { TenantOwnedEntity } from './base';

/**
 * Not branch-scoped — a customer plausibly buys from more than one branch of
 * the same chain. Offline-creatable (created ad-hoc mid-sale), so it uses a
 * client-generatable UUIDv7 id and soft delete like Sale/Purchase/Batch.
 */
export interface Customer extends TenantOwnedEntity {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  isDealer: boolean;
  totalDue: number;
  deletedAt: string | null;
}

export interface CreateCustomerRequest {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  isDealer?: boolean;
}

export interface UpdateCustomerRequest {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  isDealer?: boolean;
}
