import { IsEnum, IsIn } from 'class-validator';
import { UserStatus } from '@medicore/shared-types';

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  @IsIn([UserStatus.ACTIVE, UserStatus.DISABLED])
  status: UserStatus;
}
