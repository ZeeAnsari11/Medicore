import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { PlansModule } from '../plans/plans.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { PlatformTenantsController } from './controllers/platform-tenants.controller';
import { PlatformPlansController } from './controllers/platform-plans.controller';
import { PlatformSubscriptionsController } from './controllers/platform-subscriptions.controller';
import { PlatformSettingsController } from './controllers/platform-settings.controller';
import { PlatformDashboardController } from './controllers/platform-dashboard.controller';
import { PlatformAdminSeeder } from './seeders/platform-admin.seeder';

@Module({
  imports: [TenantsModule, UsersModule, PlansModule, SubscriptionsModule, PlatformSettingsModule],
  controllers: [
    PlatformTenantsController,
    PlatformPlansController,
    PlatformSubscriptionsController,
    PlatformSettingsController,
    PlatformDashboardController,
  ],
  providers: [PlatformAdminSeeder],
})
export class PlatformModule {}
