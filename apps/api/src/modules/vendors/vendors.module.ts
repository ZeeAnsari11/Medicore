import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vendor, VendorSchema } from './schemas/vendor.schema';
import { VendorProduct, VendorProductSchema } from './schemas/vendor-product.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { VendorProductsController } from './vendor-products.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vendor.name, schema: VendorSchema },
      { name: VendorProduct.name, schema: VendorProductSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  providers: [VendorsService],
  controllers: [VendorsController, VendorProductsController],
  exports: [VendorsService],
})
export class VendorsModule {}
