import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Batch, BatchSchema } from './schemas/batch.schema';
import { StockMovement, StockMovementSchema } from './schemas/stock-movement.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { BatchesService } from './batches.service';
import { InventoryController } from './inventory.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Batch.name, schema: BatchSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  providers: [BatchesService],
  controllers: [InventoryController],
  exports: [BatchesService],
})
export class InventoryModule {}
