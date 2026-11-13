import { SaleStatus } from '@medicore/shared-types';

/**
 * Match filter for sales that count: a pending order has no invoice yet, so it stays out of
 * reports, payments and returns. A sale with no status predates order processing and is confirmed.
 */
export const NOT_PENDING = { status: { $ne: SaleStatus.PENDING } };
