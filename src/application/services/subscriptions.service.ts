/** SubscriptionsService
 * Clean-architecture application service.
 * Exposes use-cases and enforces business rules.
 */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../../infrastructure/persistence/typeorm/entities/subscription.entity';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
} from '../../presentation/dtos/subscription.dto';
import { CreditCard } from '../../infrastructure/persistence/typeorm/entities/credit-card.entity';
import { Tenant } from '../../infrastructure/persistence/typeorm/entities/tenant.entity';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subs: Repository<Subscription>,
    @InjectRepository(CreditCard)
    private readonly cards: Repository<CreditCard>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  // create:
  async create(userId: string, dto: CreateSubscriptionDto) {
    const card = await this.cards.findOne({
      where: { id: dto.creditCardId, createdByUserId: userId },
    });
    if (!card)
      throw new ForbiddenException(
        'Credit card not found or not owned by user',
      );

    const tenant = await this.tenants.findOne({
      where: { id: dto.tenantId, createdByUserId: userId },
    });
    if (!tenant)
      throw new ForbiddenException('Tenant not found or not owned by user');

    const sub = this.subs.create({
      creditCardId: dto.creditCardId,
      tenantId: dto.tenantId, // ✅
      description: dto.description,
      amount: dto.amount,
      active: dto.active ?? true,
      createdByUserId: userId,
    });
    return this.subs.save(sub);
  }

  async list(userId: string) {
    return this.subs.find({
      where: { createdByUserId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, id: string) {
    const sub = await this.subs.findOne({ where: { id } });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.createdByUserId !== userId)
      throw new ForbiddenException('Forbidden');
    return sub;
  }

  async update(userId: string, id: string, dto: UpdateSubscriptionDto) {
    const sub = await this.findOne(userId, id);

    if (dto.creditCardId) {
      const card = await this.cards.findOne({
        where: { id: dto.creditCardId, createdByUserId: userId },
      });
      if (!card)
        throw new ForbiddenException(
          'Credit card not found or not owned by user',
        );
    }

    if (dto.tenantId) {
      const tenant = await this.tenants.findOne({
        where: { id: dto.tenantId, createdByUserId: userId },
      });
      if (!tenant)
        throw new ForbiddenException('Tenant not found or not owned by user');
    }

    Object.assign(sub, dto);
    return this.subs.save(sub);
  }

  async remove(userId: string, id: string) {
    const sub = await this.findOne(userId, id);
    await this.subs.remove(sub);
    return { deleted: true };
  }
}
