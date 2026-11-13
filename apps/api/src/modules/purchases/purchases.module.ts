import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Purchase, PurchaseSchema } from './schemas/purchase.schema';
import { Batch, BatchSchema } from '../inventory/schemas/batch.schema';
import { StockMovement, StockMovementSchema } from '../inventory/schemas/stock-movement.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import {
  ProductPriceHistory,
  ProductPriceHistorySchema,
} from '../products/schemas/product-price-history.schema';
import { Vendor, VendorSchema } from '../vendors/schemas/vendor.schema';
import { VendorProduct, VendorProductSchema } from '../vendors/schemas/vendor-product.schema';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { SequenceModule } from '../../common/sequence/sequence.module';
import { PdfModule } from '../../common/pdf/pdf.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AccountingModule } from '../accounting/accounting.module';
import { InvoicesModule } from '../../common/invoices/invoices.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Purchase.name, schema: PurchaseSchema },
      { name: Batch.name, schema: BatchSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Product.name, schema: ProductSchema },
      { name: ProductPriceHistory.name, schema: ProductPriceHistorySchema },
      { name: Vendor.name, schema: VendorSchema },
      { name: VendorProduct.name, schema: VendorProductSchema },
      { name: Branch.name, schema: BranchSchema },
      { name: User.name, schema: UserSchema },
    ]),
    SequenceModule,
    PdfModule,
    TenantsModule,
    AccountingModule,
    InvoicesModule,
  ],
  providers: [PurchasesService],
  controllers: [PurchasesController],
  exports: [PurchasesService],
})
export class PurchasesModule {}
