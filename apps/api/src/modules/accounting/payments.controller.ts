import {
  BadRequestException,
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
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchFromDocument, resolveBranchScope } from '../../common/branch/branch-scope.util';
import { PartyType } from '@medicore/shared-types';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('accounting/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @RequirePermission('acc_payments:read')
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('partyType') partyType?: PartyType,
    @Query('partyId') partyId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const payments = await this.paymentsService.listForTenant(
      user.tenantId,
      scope,
      partyType,
      partyId,
    );
    return payments.map((p) => this.paymentsService.toPaymentResponse(p));
  }

  @RequirePermission('acc_payments:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentDto,
  ) {
    // The payment belongs to the paid party's branch; the top-bar branch plays no part.
    const partyBranch = await this.paymentsService.partyBranchId(user.tenantId, dto.partyType, dto.partyId);
    const scope = resolveBranchFromDocument(
      user,
      partyBranch,
      dto.partyType === PartyType.CUSTOMER ? 'Customer not found' : 'Vendor not found',
      dto.branchId,
    );
    const payment = await this.paymentsService.createPayment(
      user.tenantId,
      scope,
      user.userId,
      dto,
    );
    return this.paymentsService.toPaymentResponse(payment);
  }

  @RequirePermission('acc_payments:void')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async void(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ) {
    await this.paymentsService.voidPayment(user.tenantId, resolveBranchScope(user, branchId), user.userId, id);
  }

  @RequirePermission('acc_payments:create')
  @Patch(':id/allocate')
  async allocate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AllocatePaymentDto,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    if (!scope) throw new BadRequestException('branchId is required to allocate a payment');
    const payment = await this.paymentsService.allocate(user.tenantId, scope, user.userId, id, dto);
    return this.paymentsService.toPaymentResponse(payment);
  }
}
