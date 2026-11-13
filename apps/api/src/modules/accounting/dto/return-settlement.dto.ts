import { IsEnum, IsOptional } from 'class-validator';
import { PaymentMethod, ReturnSettlementMode } from '@medicore/shared-types';

/** How the return is settled: against the balance/credit (ADJUST) or with money out/in now (REFUND). */
export class ReturnSettlementDto {
  @IsEnum(ReturnSettlementMode)
  mode: ReturnSettlementMode;

  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;
}
