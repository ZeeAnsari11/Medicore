import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('accounting/accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @RequirePermission('acc_chart_of_accounts:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const accounts = await this.accountsService.list(user.tenantId);
    return accounts.map((a) => this.accountsService.toAccountResponse(a));
  }

  @RequirePermission('acc_chart_of_accounts:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAccountDto) {
    const account = await this.accountsService.create(user.tenantId, dto);
    return this.accountsService.toAccountResponse(account);
  }

  @RequirePermission('acc_chart_of_accounts:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    const account = await this.accountsService.update(user.tenantId, id, dto);
    return this.accountsService.toAccountResponse(account);
  }

  @RequirePermission('acc_chart_of_accounts:delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.accountsService.remove(user.tenantId, id);
  }
}
