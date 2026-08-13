import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Plan, PlanDocument } from './schemas/plan.schema';
import { PlanStatus } from '@medicore/shared-types';
import type { Plan as PlanType } from '@medicore/shared-types';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(@InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>) {}

  create(dto: CreatePlanDto) {
    return this.planModel.create({ ...dto, status: PlanStatus.ACTIVE });
  }

  findAll() {
    return this.planModel.find().sort({ createdAt: -1 });
  }

  findById(id: string) {
    return this.planModel.findById(id);
  }

  async update(id: string, dto: UpdatePlanDto) {
    const plan = await this.planModel.findById(id);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    Object.assign(plan, dto);
    return plan.save();
  }

  async setStatus(id: string, status: PlanStatus) {
    const plan = await this.planModel.findById(id);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    plan.status = status;
    return plan.save();
  }

  toPlanResponse(plan: PlanDocument): PlanType {
    const obj = plan.toObject() as any;
    return {
      id: obj._id.toString(),
      name: obj.name,
      description: obj.description,
      priceCents: obj.priceCents,
      currency: obj.currency,
      billingInterval: obj.billingInterval,
      maxUsers: obj.maxUsers,
      status: obj.status,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
