import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Batch, BatchSchema } from './schemas/batch.schema';
import { StockMovement, StockMovementSchema } from './schemas/stock-movement.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { BatchesService } from './batches.service';
import { BatchAllocationService } from './batch-allocation.service';
import { InventoryController } from './inventory.controller';
import { StockTransfer, StockTransferSchema } from './schemas/stock-transfer.schema';
import { StockTransfersService } from './stock-transfers.service';
import { StockTransfersController } from './stock-transfers.controller';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { TenantsModule } from '../tenants/tenants.module';
import { SequenceModule } from '../../common/sequence/sequence.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Batch.name, schema: BatchSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Product.name, schema: ProductSchema },
      { name: StockTransfer.name, schema: StockTransferSchema },
      { name: Branch.name, schema: BranchSchema },
    ]),
    SequenceModule,
    TenantsModule,
  ],
  providers: [BatchesService, BatchAllocationService, StockTransfersService],
  controllers: [InventoryController, StockTransfersController],
  exports: [BatchesService, BatchAllocationService],
})
export class InventoryModule {}
