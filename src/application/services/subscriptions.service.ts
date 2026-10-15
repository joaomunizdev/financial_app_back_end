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
import { DataSource, Repository } from 'typeorm';
import { Subscription } from '../../infrastructure/persistence/typeorm/entities/subscription.entity';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
} from '../../presentation/dtos/subscription.dto';
import { CreditCard } from '../../infrastructure/persistence/typeorm/entities/credit-card.entity';
import { Tenant } from '../../infrastructure/persistence/typeorm/entities/tenant.entity';
import { StatementsService } from './statements.service';
import { CategoriesService } from './categories.service';
import { PageRequest, paginate } from '../utils/pagination';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subs: Repository<Subscription>,
    @InjectRepository(CreditCard)
    private readonly cards: Repository<CreditCard>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly statements: StatementsService,
    private readonly dataSource: DataSource,
    private readonly categories: CategoriesService,
  ) {}

  // create:
  async create(userId: string, dto: CreateSubscriptionDto) {
    const card = await this.cards.findOne({
      where: { id: dto.creditCardId, createdByUserId: userId, active: true },
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
    await this.categories.assertUsable(dto.categoryId, userId);

    // Open statements snapshot active subscriptions, so keep them in sync.
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Subscription);
      const sub = await repo.save(
        repo.create({
          creditCardId: dto.creditCardId,
          tenantId: dto.tenantId,
          categoryId: dto.categoryId ?? null,
          description: dto.description,
          amount: dto.amount,
          active: dto.active ?? true,
          createdByUserId: userId,
        }),
      );
      await this.statements.rebuildOpenStatements(manager, [sub.creditCardId], userId);
      return sub;
    });
  }

  async list(
    userId: string,
    filters: {
      search?: string;
      creditCardId?: string;
      categoryId?: string;
      status?: 'active' | 'inactive';
    } = {},
    page?: PageRequest,
  ) {
    const qb = this.subs
      .createQueryBuilder('sub')
      .innerJoinAndSelect('sub.creditCard', 'card')
      .leftJoin('sub.tenant', 'tenant')
      .leftJoin('sub.category', 'category')
      .where('sub.createdByUserId = :userId', { userId })
      .andWhere('card.active = true');
    if (filters.search) {
      qb.andWhere('sub.description ILIKE :search', { search: `%${filters.search}%` });
    }
    if (filters.creditCardId) {
      qb.andWhere('sub.creditCardId = :creditCardId', { creditCardId: filters.creditCardId });
    }
    if (filters.categoryId) {
      qb.andWhere('sub.categoryId = :categoryId', { categoryId: filters.categoryId });
    }
    if (filters.status) {
      qb.andWhere('sub.active = :active', { active: filters.status === 'active' });
    }
    return paginate(
      qb,
      page,
      {
        description: 'sub.description',
        amount: 'sub.amount',
        active: 'sub.active',
        card: 'card.nickname',
        tenant: 'tenant.name',
        category: 'category.name',
      },
      [['sub.createdAt', 'DESC']],
    );
  }

  async findOne(userId: string, id: string) {
    const sub = await this.subs.findOne({
      where: { id },
      relations: { creditCard: true },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.createdByUserId !== userId)
      throw new ForbiddenException('Forbidden');
    if (!sub.creditCard.active) throw new NotFoundException('Subscription not found');
    return sub;
  }

  async update(userId: string, id: string, dto: UpdateSubscriptionDto) {
    const sub = await this.findOne(userId, id);

    if (dto.creditCardId) {
      const card = await this.cards.findOne({
        where: { id: dto.creditCardId, createdByUserId: userId, active: true },
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
    await this.categories.assertUsable(dto.categoryId, userId);

    return this.dataSource.transaction(async (manager) => {
      const previousCardId = sub.creditCardId;
      Object.assign(sub, dto);
      const saved = await manager.getRepository(Subscription).save(sub);
      await this.statements.rebuildOpenStatements(
        manager,
        [previousCardId, saved.creditCardId],
        userId,
      );
      // Closed statements keep their amounts but follow the category.
      await this.statements.syncItemsCategory(
        manager,
        { subscriptionId: saved.id },
        saved.categoryId ?? null,
      );
      return saved;
    });
  }

  async remove(userId: string, id: string) {
    const sub = await this.findOne(userId, id);
    const cardId = sub.creditCardId;
    // Items in closed statements keep their snapshot (subscription_id is SET NULL).
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Subscription).remove(sub);
      await this.statements.rebuildOpenStatements(manager, [cardId], userId);
    });
    return { deleted: true };
  }
}
