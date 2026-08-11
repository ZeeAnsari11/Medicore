import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { TenantRole, UserStatus } from '@medicore/shared-types';

export interface CreateUserInput {
  tenantId: Types.ObjectId;
  email: string;
  passwordHash: string;
  fullName: string;
  tenantRole: TenantRole;
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() });
  }

  findById(id: string) {
    return this.userModel.findById(id);
  }

  create(input: CreateUserInput) {
    return this.userModel.create({
      ...input,
      email: input.email.toLowerCase(),
      status: UserStatus.ACTIVE,
    });
  }
}
