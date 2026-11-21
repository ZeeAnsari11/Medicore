import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { City, CitySchema } from './schemas/city.schema';
import { Territory, TerritorySchema } from './schemas/territory.schema';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: City.name, schema: CitySchema },
      { name: Territory.name, schema: TerritorySchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
  ],
  providers: [LocationsService],
  controllers: [LocationsController],
  exports: [LocationsService],
})
export class LocationsModule {}
