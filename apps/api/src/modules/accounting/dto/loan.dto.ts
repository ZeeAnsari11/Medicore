import { IsDateString, IsIn, IsMongoId, IsNumber, IsOptional, IsPositive, IsString, Min, MinLength } from 'class-validator';

export class CreateLoanDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsString()
  @MinLength(1)
  lender: string;

  @IsNumber()
  @IsPositive()
  principal: number;

  @IsDateString()
  @IsOptional()
  loanDate?: string;

  @IsIn(['CASH', 'BANK'])
  method: 'CASH' | 'BANK';

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateLoanRepaymentDto {
  @IsDateString()
  @IsOptional()
  date?: string;

  @IsNumber()
  @Min(0)
  principal: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  interest?: number;

  @IsIn(['CASH', 'BANK'])
  method: 'CASH' | 'BANK';

  @IsString()
  @IsOptional()
  notes?: string;
}
