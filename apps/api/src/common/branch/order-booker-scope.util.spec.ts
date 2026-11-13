import { AuthenticatedUser, SystemRole, TenantRole } from '@medicore/shared-types';
import { canEditSaleOf, resolveOwnSalesScope } from './order-booker-scope.util';

const user = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  userId: 'u1',
  tenantId: 't1',
  username: 'ali',
  tenantRole: TenantRole.TENANT_USER,
  ...over,
});

describe('order booker scope', () => {
  it('limits a user without view_all to their own sales', () => {
    expect(resolveOwnSalesScope(user(), false)).toBe('u1');
  });

  it('shows everything to users with view_all', () => {
    expect(resolveOwnSalesScope(user(), true)).toBeNull();
  });

  it('shows everything to admins even without view_all', () => {
    expect(
      resolveOwnSalesScope(user({ tenantRole: TenantRole.TENANT_SUPER_ADMIN }), false),
    ).toBeNull();
    expect(resolveOwnSalesScope(user({ systemRole: SystemRole.SUPER_ADMIN }), false)).toBeNull();
  });

  it('lets only the owner or an admin edit a sale', () => {
    expect(canEditSaleOf(user(), 'u1')).toBe(true);
    expect(canEditSaleOf(user(), 'u2')).toBe(false);
    expect(canEditSaleOf(user(), undefined)).toBe(false);
    expect(canEditSaleOf(user({ tenantRole: TenantRole.TENANT_SUPER_ADMIN }), 'u2')).toBe(true);
  });
});
