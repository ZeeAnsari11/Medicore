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
  Query,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @RequirePermission('customers:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('search') search?: string) {
    const customers = await this.customersService.listForTenant(user.tenantId, search);
    return customers.map((c) => this.customersService.toCustomerResponse(c));
  }

  @RequirePermission('customers:create')
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerDto) {
    const customer = await this.customersService.createCustomer(user.tenantId, dto);
    return this.customersService.toCustomerResponse(customer);
  }

  @RequirePermission('customers:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    const customer = await this.customersService.updateCustomer(user.tenantId, id, dto);
    return this.customersService.toCustomerResponse(customer);
  }

  @RequirePermission('customers:delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.customersService.deleteCustomer(user.tenantId, id);
  }
}
