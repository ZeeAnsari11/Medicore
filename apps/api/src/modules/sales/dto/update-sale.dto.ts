import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateSaleItemDto } from './create-sale.dto';

/** Editable fields of an unpaid sale. The invoice number, branch and payment fields never change. */
export class UpdateSaleDto {
  @IsString()
  @IsOptional()
  customerId?: string;

  @IsDateString()
  @IsOptional()
  saleDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];
}
