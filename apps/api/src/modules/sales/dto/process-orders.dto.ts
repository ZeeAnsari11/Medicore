import { ArrayMaxSize, ArrayMinSize, IsArray, IsMongoId, IsOptional, IsString, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ProcessOrdersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  saleIds: string[];

  @IsOptional()
  @IsMongoId()
  branchId?: string;
}

export class PendingOrdersSummaryQueryDto {
  @Matches(DAY, { message: 'date must be yyyy-mm-dd' })
  date: string;

  @IsOptional()
  @IsMongoId()
  branchId?: string;
}

export class PendingOrdersQueryDto extends PendingOrdersSummaryQueryDto {
  @IsMongoId()
  orderBookerId: string;
}
