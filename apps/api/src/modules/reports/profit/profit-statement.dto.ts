import { Transform } from 'class-transformer';
import { IsBoolean, IsMongoId, IsOptional, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const toBool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class ProfitStatementQueryDto {
  /** Karachi calendar day, yyyy-mm-dd. */
  @Matches(DAY)
  from: string;

  @Matches(DAY)
  to: string;

  @IsOptional() @IsMongoId() branchId?: string;

  /** Company filter: sales, returns, purchases and stock of this manufacturer's products only. */
  @IsOptional() @IsMongoId() manufacturerId?: string;

  /** Leave sale returns out of Net Sales. */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  excludeReturns?: boolean;
}
