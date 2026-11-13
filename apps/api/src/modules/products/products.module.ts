import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { Manufacturer, ManufacturerSchema } from '../manufacturers/schemas/manufacturer.schema';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Manufacturer.name, schema: ManufacturerSchema },
      { name: Category.name, schema: CategorySchema },
    ]), RolesModule],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}
