import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Manufacturer, ManufacturerSchema } from './schemas/manufacturer.schema';
import { Vendor, VendorSchema } from '../vendors/schemas/vendor.schema';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { RolesModule } from '../roles/roles.module';
import { ManufacturersService } from './manufacturers.service';
import { ManufacturersController } from './manufacturers.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Manufacturer.name, schema: ManufacturerSchema },
      { name: Vendor.name, schema: VendorSchema },
      { name: Branch.name, schema: BranchSchema },
    ]),
    RolesModule,
  ],
  providers: [ManufacturersService],
  controllers: [ManufacturersController],
  exports: [ManufacturersService],
})
export class ManufacturersModule {}
