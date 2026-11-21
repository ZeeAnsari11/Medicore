import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantStatusGuard } from './common/guards/tenant-status.guard';
import { TenantContextGuard } from './common/guards/tenant-context.guard';
import { TenantContextMiddleware } from './common/tenancy/tenant-context.middleware';
import { tenantScopePlugin } from './common/tenancy/tenant-scope.plugin';
import { branchScopePlugin } from './common/tenancy/branch-scope.plugin';
import { Branch, BranchSchema } from './modules/branches/schemas/branch.schema';
import { ImpersonationGuard } from './common/guards/impersonation.guard';
import {
  ImpersonationLog,
  ImpersonationLogSchema,
} from './modules/platform/schemas/impersonation-log.schema';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { HealthModule } from './modules/health/health.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { RolesModule } from './modules/roles/roles.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PlansModule } from './modules/plans/plans.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module';
import { BranchesModule } from './modules/branches/branches.module';
import { ManufacturersModule } from './modules/manufacturers/manufacturers.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { LocationsModule } from './modules/locations/locations.module';
import { ProductsModule } from './modules/products/products.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SalesModule } from './modules/sales/sales.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { AccountingModule } from './modules/accounting/accounting.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongoUri'),
        connectionFactory: (connection: any) => {
          connection.plugin(tenantScopePlugin);
          connection.plugin(branchScopePlugin); // after the tenant plugin: its $match goes second
          return connection;
        },
      }),
    }),
    MongooseModule.forFeature([
      { name: ImpersonationLog.name, schema: ImpersonationLogSchema },
      { name: Branch.name, schema: BranchSchema },
    ]),
    HealthModule,
    TenantsModule,
    UsersModule,
    AuthModule,
    PermissionsModule,
    RolesModule,
    PlansModule,
    SubscriptionsModule,
    PlatformSettingsModule,
    PlatformModule,
    BranchesModule,
    ManufacturersModule,
    CategoriesModule,
    LocationsModule,
    ProductsModule,
    VendorsModule,
    InventoryModule,
    PurchasesModule,
    CustomersModule,
    SalesModule,
    ReportsModule,
    RealtimeModule,
    AccountingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: ImpersonationGuard },
    { provide: APP_GUARD, useClass: TenantStatusGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
