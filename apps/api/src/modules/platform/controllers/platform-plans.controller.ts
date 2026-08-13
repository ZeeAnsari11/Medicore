import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { PlansService } from '../../plans/plans.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SystemRole } from '@medicore/shared-types';
import { CreatePlanDto } from '../../plans/dto/create-plan.dto';
import { UpdatePlanDto } from '../../plans/dto/update-plan.dto';
import { UpdatePlanStatusDto } from '../../plans/dto/update-plan-status.dto';

@Controller('platform/plans')
export class PlatformPlansController {
  constructor(private readonly plansService: PlansService) {}

  @Roles(SystemRole.SUPER_ADMIN)
  @Get()
  async list() {
    const plans = await this.plansService.findAll();
    return plans.map((plan) => this.plansService.toPlanResponse(plan));
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePlanDto) {
    const plan = await this.plansService.create(dto);
    return this.plansService.toPlanResponse(plan);
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    const plan = await this.plansService.update(id, dto);
    return this.plansService.toPlanResponse(plan);
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() dto: UpdatePlanStatusDto) {
    const plan = await this.plansService.setStatus(id, dto.status);
    return this.plansService.toPlanResponse(plan);
  }
}
