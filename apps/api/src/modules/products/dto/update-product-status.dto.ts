import { IsEnum } from 'class-validator';
import { ProductStatus } from '@medicore/shared-types';

export class UpdateProductStatusDto {
  @IsEnum(ProductStatus)
  status: ProductStatus;
}
