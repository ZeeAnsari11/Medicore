import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsMongoId, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreatePurchaseItemDto } from './create-purchase.dto';

/** Editable fields of an unpaid purchase. The purchase number, branch and payment fields never change. */
export class UpdatePurchaseDto {
  @IsMongoId()
  @IsOptional()
  vendorId?: string;

  @IsString()
  @IsOptional()
  vendorInvoiceNumber?: string;

  @IsDateString()
  @IsOptional()
  purchaseDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items: CreatePurchaseItemDto[];
}
