import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sale, SaleSchema } from '../sales/schemas/sale.schema';
import { Batch, BatchSchema } from '../inventory/schemas/batch.schema';
import { StockMovement, StockMovementSchema } from '../inventory/schemas/stock-movement.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { SaleReturn, SaleReturnSchema } from '../accounting/schemas/sale-return.schema';
import { Purchase, PurchaseSchema } from '../purchases/schemas/purchase.schema';
import { Manufacturer, ManufacturerSchema } from '../manufacturers/schemas/manufacturer.schema';
import { Vendor, VendorSchema } from '../vendors/schemas/vendor.schema';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { ReportsService } from './reports.service';
import { DashboardService } from './dashboard.service';
import { ReportsController } from './reports.controller';
import { SsrController } from './ssr/ssr.controller';
import { SsrService } from './ssr/ssr.service';
import { SsrExportService } from './ssr/ssr-export.service';
import { Account, AccountSchema } from '../accounting/schemas/account.schema';
import { JournalEntry, JournalEntrySchema } from '../accounting/schemas/journal-entry.schema';
import { SupplyReportsController } from './supply/supply-reports.controller';
import { SupplyReportsService } from './supply/supply-reports.service';
import { TenantsModule } from '../tenants/tenants.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [
    RolesModule,
    TenantsModule,
    MongooseModule.forFeature([
      { name: Sale.name, schema: SaleSchema },
      { name: SaleReturn.name, schema: SaleReturnSchema },
      { name: Batch.name, schema: BatchSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Purchase.name, schema: PurchaseSchema },
      { name: Manufacturer.name, schema: ManufacturerSchema },
      { name: Vendor.name, schema: VendorSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Branch.name, schema: BranchSchema },
      { name: User.name, schema: UserSchema },
      { name: Account.name, schema: AccountSchema },
      { name: JournalEntry.name, schema: JournalEntrySchema },
    ]),
    InventoryModule,
  ],
  providers: [ReportsService, DashboardService, SsrService, SsrExportService, SupplyReportsService],
  controllers: [ReportsController, SsrController, SupplyReportsController],
})
export class ReportsModule {}
