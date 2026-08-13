import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subscription, SubscriptionDocument } from './schemas/subscription.schema';
import { SubscriptionStatus } from '@medicore/shared-types';
import type { Subscription as SubscriptionType } from '@medicore/shared-types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
  ) {}

  async createForTenant(tenantId: string, planId: string, trialDays: number) {
    const now = new Date();
    const currentPeriodEnd = new Date(now.getTime() + Math.max(trialDays, 0) * MS_PER_DAY);

    return this.subscriptionModel.create({
      tenantId: new Types.ObjectId(tenantId),
      planId: new Types.ObjectId(planId),
      status: trialDays > 0 ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd,
      canceledAt: null,
    });
  }

  findAll() {
    return this.subscriptionModel.find().sort({ createdAt: -1 });
  }

  findByTenantId(tenantId: string) {
    return this.subscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) });
  }

  async assignPlan(tenantId: string, planId: string) {
    const subscription = await this.subscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
    });

    if (!subscription) {
      // Tenant has no subscription yet (e.g. no default plan was configured
      // when it was created) — a manual admin assignment starts it active,
      // not in a trial.
      return this.createForTenant(tenantId, planId, 0);
    }

    subscription.planId = new Types.ObjectId(planId);
    return subscription.save();
  }

  async setStatus(tenantId: string, status: SubscriptionStatus) {
    const subscription = await this.subscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!subscription) {
      throw new NotFoundException('Subscription not found for this tenant');
    }

    subscription.status = status;
    subscription.canceledAt = status === SubscriptionStatus.CANCELED ? new Date() : null;
    return subscription.save();
  }

  toSubscriptionResponse(subscription: SubscriptionDocument): SubscriptionType {
    const obj = subscription.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      planId: obj.planId.toString(),
      status: obj.status,
      currentPeriodStart: obj.currentPeriodStart,
      currentPeriodEnd: obj.currentPeriodEnd,
      canceledAt: obj.canceledAt,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
