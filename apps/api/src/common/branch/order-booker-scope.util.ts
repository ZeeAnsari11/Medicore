import { AuthenticatedUser } from '@medicore/shared-types';
import { isAdminUser } from './branch-scope.util';

/**
 * Own-sales scope. A user who is not an admin and lacks `sales:view_all` is an Order Booker: they only see
 * and edit the sales they booked. Returns that user's id, or null when every sale in their branch scope is visible.
 */
export function resolveOwnSalesScope(user: AuthenticatedUser, canViewAll: boolean): string | null {
  if (isAdminUser(user) || canViewAll) return null;
  return user.userId;
}

/** Edits to a sale are for its Order Booker or an admin (on top of the invoice edit lock). */
export function canEditSaleOf(
  user: AuthenticatedUser,
  orderBookerId: string | undefined | null,
): boolean {
  return isAdminUser(user) || (!!orderBookerId && orderBookerId === user.userId);
}
