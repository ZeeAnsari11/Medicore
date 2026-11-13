import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReassignOrderBookerDto {
  @IsMongoId()
  orderBookerId: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
