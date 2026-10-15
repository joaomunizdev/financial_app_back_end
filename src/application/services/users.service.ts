import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../infrastructure/persistence/typeorm/entities/user.entity';
import { normalizeIdentity } from './auth.service';
import type {
  ChangePasswordDto,
  TwoFactorDto,
  UpdateProfileDto,
} from '../../presentation/dtos/user.dto';

/** Public shape of the signed-in user; never return the User entity itself. */
export function toProfile(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    cpf: user.cpf,
    phone: user.phone,
    birthDate: user.birthDate,
    emailVerified: !!user.emailVerifiedAt,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt,
  };
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  private async find(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    return user;
  }

  private async assertPassword(user: User, password: string) {
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      // 400, not 401: the client treats 401 as an expired session and signs out.
      throw new BadRequestException('Current password is incorrect');
    }
  }

  async me(userId: string) {
    return toProfile(await this.find(userId));
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.find(userId);
    const identity = normalizeIdentity(dto);
    if (identity.cpf) {
      // The CPF is permanent: older accounts may fill it in once, nobody can change it.
      if (user.cpf && user.cpf !== identity.cpf) {
        throw new BadRequestException('CPF cannot be changed');
      }
      if (!user.cpf) {
        const taken = await this.users.findOne({ where: { cpf: identity.cpf, id: Not(userId) } });
        if (taken) throw new ConflictException('CPF already in use');
      }
    }
    if (dto.name !== undefined) user.name = dto.name.trim();
    Object.assign(user, identity);
    return toProfile(await this.users.save(user));
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.find(userId);
    await this.assertPassword(user, dto.currentPassword);
    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.users.save(user);
    return { changed: true };
  }

  async setTwoFactor(userId: string, dto: TwoFactorDto) {
    const user = await this.find(userId);
    await this.assertPassword(user, dto.password);
    user.twoFactorEnabled = dto.enabled;
    return toProfile(await this.users.save(user));
  }
}
