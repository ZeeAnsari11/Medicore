import { User, UserSchema } from '../users/schemas/user.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sale, SaleSchema } from './schemas/sale.schema';
import { Batch, BatchSchema } from '../inventory/schemas/batch.schema';
import { StockMovement, StockMovementSchema } from '../inventory/schemas/stock-movement.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { SalesService } from './sales.service';
import { OrderBookersService } from './order-bookers.service';
import { CashReceipt, CashReceiptSchema } from './schemas/cash-receipt.schema';
import {
  CashReceiptHistory,
  CashReceiptHistorySchema,
} from './schemas/cash-receipt-history.schema';
import { CashReceiptsService } from './cash-receipts.service';
import { SalesController } from './sales.controller';
import { SequenceModule } from '../../common/sequence/sequence.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PdfModule } from '../../common/pdf/pdf.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AccountingModule } from '../accounting/accounting.module';
import { RolesModule } from '../roles/roles.module';
import { InvoicesModule } from '../../common/invoices/invoices.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sale.name, schema: SaleSchema },
      { name: Batch.name, schema: BatchSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Branch.name, schema: BranchSchema },
      { name: User.name, schema: UserSchema },
      { name: CashReceipt.name, schema: CashReceiptSchema },
      { name: CashReceiptHistory.name, schema: CashReceiptHistorySchema },
    ]),
    SequenceModule,
    InventoryModule,
    PdfModule,
    TenantsModule,
    AccountingModule,
    RolesModule,
    InvoicesModule,
  ],
  providers: [SalesService, CashReceiptsService, OrderBookersService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}
