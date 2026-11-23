import { WALK_IN_CUSTOMER_ID } from '@medicore/shared-types';

export const isWalkInFilter = (customerId?: string) => customerId === WALK_IN_CUSTOMER_ID;

/** Mongo condition for the `customerId` list filter: a real id, or sales with no customer for walk-in. */
export const customerFilter = (customerId: string): string | { $in: [null, ''] } =>
  isWalkInFilter(customerId) ? { $in: [null, ''] } : customerId;
