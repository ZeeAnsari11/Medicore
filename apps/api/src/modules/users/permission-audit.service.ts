import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PermissionAudit, PermissionAuditDocument } from './schemas/permission-audit.schema';

@Injectable()
export class PermissionAuditService {
  constructor(
    @InjectModel(PermissionAudit.name) private readonly model: Model<PermissionAuditDocument>,
  ) {}

  async log(params: {
    tenantId: string;
    actorId: string;
    targetType: 'user' | 'role';
    targetId: string;
    oldPermissions: string[];
    newPermissions: string[];
  }) {
    const sort = (a: string[]) => [...a].sort();
    const oldP = sort(params.oldPermissions);
    const newP = sort(params.newPermissions);
    if (JSON.stringify(oldP) === JSON.stringify(newP)) return;
    await this.model.create({
      tenantId: new Types.ObjectId(params.tenantId),
      actorId: new Types.ObjectId(params.actorId),
      targetType: params.targetType,
      targetId: new Types.ObjectId(params.targetId),
      oldPermissions: oldP,
      newPermissions: newP,
    });
  }
}
