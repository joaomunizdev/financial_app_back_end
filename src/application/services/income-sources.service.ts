import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IncomeSource,
  IncomeSourceType,
} from '../../infrastructure/persistence/typeorm/entities/income-source.entity';
import {
  CreateIncomeSourceDto,
  UpdateIncomeSourceDto,
} from '../../presentation/dtos/income-source.dto';
import { Tenant } from '../../infrastructure/persistence/typeorm/entities/tenant.entity';
import { todayInReportTimeZone } from '../utils/dates';

function assertValidIncome(i: IncomeSource) {
  if (i.startDate && i.endDate && i.endDate < i.startDate) {
    throw new BadRequestException('endDate must be on or after startDate');
  }
}

@Injectable()
export class IncomeSourcesService {
  constructor(
    @InjectRepository(IncomeSource)
    private readonly incomeSources: Repository<IncomeSource>,
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
  ) {}

  async create(userId: string, dto: CreateIncomeSourceDto) {
    const tenant = await this.tenants.findOne({
      where: { id: dto.tenantId, createdByUserId: userId },
    });
    if (!tenant)
      throw new ForbiddenException('Tenant not found or not owned by user');

    const incomeType = dto.incomeType ?? IncomeSourceType.FIXED;
    const incomeSource = this.incomeSources.create({
      tenantId: dto.tenantId,
      description: dto.description,
      amount: dto.amount,
      incomeType,
      startDate:
        dto.startDate ??
        (incomeType === IncomeSourceType.ONE_TIME ? todayInReportTimeZone() : null),
      endDate: dto.endDate ?? null,
      createdByUserId: userId,
    });
    assertValidIncome(incomeSource);

    return this.incomeSources.save(incomeSource);
  }

  async list(userId: string) {
    return this.incomeSources.find({
      where: { createdByUserId: userId },
      relations: { tenant: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, id: string) {
    const incomeSource = await this.incomeSources.findOne({
      where: { id },
      relations: { tenant: true },
    });
    if (!incomeSource) throw new NotFoundException('Income source not found');
    if (incomeSource.createdByUserId !== userId) {
      throw new ForbiddenException('Forbidden');
    }

    return incomeSource;
  }

  async update(userId: string, id: string, dto: UpdateIncomeSourceDto) {
    const incomeSource = await this.findOne(userId, id);

    if (dto.tenantId) {
      const tenant = await this.tenants.findOne({
        where: { id: dto.tenantId, createdByUserId: userId },
      });
      if (!tenant)
        throw new ForbiddenException('Tenant not found or not owned by user');
      // findOne loads the `tenant` relation; save() would persist that stale relation
      // over the new tenantId, so the relation must be replaced too.
      incomeSource.tenant = tenant;
    }

    Object.assign(incomeSource, dto);
    // A one-time income must always know which month it belongs to
    if (incomeSource.incomeType === IncomeSourceType.ONE_TIME && !incomeSource.startDate) {
      incomeSource.startDate = todayInReportTimeZone();
    }
    assertValidIncome(incomeSource);
    return this.incomeSources.save(incomeSource);
  }

  async remove(userId: string, id: string) {
    const incomeSource = await this.findOne(userId, id);
    await this.incomeSources.remove(incomeSource);
    return { deleted: true };
  }
}
