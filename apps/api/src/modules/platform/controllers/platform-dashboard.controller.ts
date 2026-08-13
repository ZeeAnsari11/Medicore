import { Controller, Get } from '@nestjs/common';
import { TenantsService } from '../../tenants/tenants.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SystemRole, TenantStatus, SubscriptionStatus, PlatformDashboardSummary } from '@medicore/shared-types';

function countBy<T extends string>(values: T[], possibleValues: readonly T[]): Record<T, number> {
  const counts = Object.fromEntries(possibleValues.map((value) => [value, 0])) as Record<T, number>;
  for (const value of values) {
    counts[value] += 1;
  }
  return counts;
}

@Controller('platform/dashboard')
export class PlatformDashboardController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Roles(SystemRole.SUPER_ADMIN)
  @Get()
  async summary(): Promise<PlatformDashboardSummary> {
    const [tenants, subscriptions] = await Promise.all([
      this.tenantsService.findAll(),
      this.subscriptionsService.findAll(),
    ]);

    return {
      totalTenants: tenants.length,
      tenantsByStatus: countBy(
        tenants.map((tenant) => tenant.status),
        Object.values(TenantStatus),
      ),
      totalSubscriptions: subscriptions.length,
      subscriptionsByStatus: countBy(
        subscriptions.map((subscription) => subscription.status),
        Object.values(SubscriptionStatus),
      ),
      recentTenants: tenants.slice(0, 5).map((tenant) => this.tenantsService.toTenantResponse(tenant)),
    };
  }
}
