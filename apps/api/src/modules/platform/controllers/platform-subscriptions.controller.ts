import { CrossTenant } from '../../../common/decorators/cross-tenant.decorator';
import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { TenantsService } from '../../tenants/tenants.service';
import { PlansService } from '../../plans/plans.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SystemRole, SubscriptionWithDetails } from '@medicore/shared-types';
import { AssignSubscriptionPlanDto } from '../../subscriptions/dto/assign-subscription-plan.dto';
import { UpdateSubscriptionStatusDto } from '../../subscriptions/dto/update-subscription-status.dto';

@CrossTenant()
@Controller('platform/subscriptions')
export class PlatformSubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly tenantsService: TenantsService,
    private readonly plansService: PlansService,
  ) {}

  @Roles(SystemRole.SUPER_ADMIN)
  @Get()
  async list(): Promise<SubscriptionWithDetails[]> {
    const [subscriptions, tenants, plans] = await Promise.all([
      this.subscriptionsService.findAll(),
      this.tenantsService.findAll(),
      this.plansService.findAll(),
    ]);

    const tenantsById = new Map(tenants.map((tenant) => [tenant._id.toString(), tenant]));
    const plansById = new Map(plans.map((plan) => [plan._id.toString(), plan]));

    return subscriptions
      .filter((subscription) => tenantsById.has(subscription.tenantId.toString()))
      .filter((subscription) => plansById.has(subscription.planId.toString()))
      .map((subscription) => {
        const tenant = tenantsById.get(subscription.tenantId.toString())!;
        const plan = plansById.get(subscription.planId.toString())!;
        return {
          ...this.subscriptionsService.toSubscriptionResponse(subscription),
          tenant: this.tenantsService.toTenantResponse(tenant),
          plan: this.plansService.toPlanResponse(plan),
        };
      });
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Patch(':tenantId/plan')
  async assignPlan(@Param('tenantId') tenantId: string, @Body() dto: AssignSubscriptionPlanDto) {
    const subscription = await this.subscriptionsService.assignPlan(tenantId, dto.planId);
    return this.subscriptionsService.toSubscriptionResponse(subscription);
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Patch(':tenantId/status')
  async setStatus(@Param('tenantId') tenantId: string, @Body() dto: UpdateSubscriptionStatusDto) {
    const subscription = await this.subscriptionsService.setStatus(tenantId, dto.status);
    return this.subscriptionsService.toSubscriptionResponse(subscription);
  }
}
