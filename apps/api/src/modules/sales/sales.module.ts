import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sale, SaleSchema } from './schemas/sale.schema';
import { Batch, BatchSchema } from '../inventory/schemas/batch.schema';
import { StockMovement, StockMovementSchema } from '../inventory/schemas/stock-movement.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { SequenceModule } from '../../common/sequence/sequence.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sale.name, schema: SaleSchema },
      { name: Batch.name, schema: BatchSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Branch.name, schema: BranchSchema },
    ]),
    SequenceModule,
    InventoryModule,
  ],
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}
