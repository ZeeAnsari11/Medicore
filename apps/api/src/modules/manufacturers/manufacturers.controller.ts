import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ManufacturersService } from './manufacturers.service';
import { CreateManufacturerDto } from './dto/create-manufacturer.dto';
import { UpdateManufacturerDto } from './dto/update-manufacturer.dto';
import { UpdateManufacturerStatusDto } from './dto/update-manufacturer-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('manufacturers')
export class ManufacturersController {
  constructor(private readonly manufacturersService: ManufacturersService) {}

  @RequirePermission('manufacturers:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('search') search?: string) {
    const manufacturers = await this.manufacturersService.listForTenant(user.tenantId, search);
    return manufacturers.map((m) => this.manufacturersService.toManufacturerResponse(m));
  }

  @RequirePermission('manufacturers:create')
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateManufacturerDto) {
    const manufacturer = await this.manufacturersService.createManufacturer(user.tenantId, dto);
    return this.manufacturersService.toManufacturerResponse(manufacturer);
  }

  @RequirePermission('manufacturers:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateManufacturerDto,
  ) {
    const manufacturer = await this.manufacturersService.updateManufacturer(user.tenantId, id, dto);
    return this.manufacturersService.toManufacturerResponse(manufacturer);
  }

  @RequirePermission('manufacturers:update')
  @Patch(':id/status')
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateManufacturerStatusDto,
  ) {
    const manufacturer = await this.manufacturersService.setStatus(user.tenantId, id, dto.isActive);
    return this.manufacturersService.toManufacturerResponse(manufacturer);
  }
}
