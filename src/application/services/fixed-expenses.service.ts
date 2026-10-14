import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FixedExpense } from '../../infrastructure/persistence/typeorm/entities/fixed-expense.entity';
import {
  CreateFixedExpenseDto,
  UpdateFixedExpenseDto,
} from '../../presentation/dtos/fixed-expense.dto';
import { Tenant } from '../../infrastructure/persistence/typeorm/entities/tenant.entity';

function assertValidPeriod(e: FixedExpense) {
  if (e.startDate && e.endDate && e.endDate < e.startDate) {
    throw new BadRequestException('endDate must be on or after startDate');
  }
}

@Injectable()
export class FixedExpensesService {
  constructor(
    @InjectRepository(FixedExpense)
    private readonly fixedExpenses: Repository<FixedExpense>,
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
  ) {}

  async create(userId: string, dto: CreateFixedExpenseDto) {
    const tenant = await this.tenants.findOne({
      where: { id: dto.tenantId, createdByUserId: userId },
    });
    if (!tenant)
      throw new ForbiddenException('Tenant not found or not owned by user');

    const fixedExpense = this.fixedExpenses.create({
      tenantId: dto.tenantId,
      description: dto.description,
      amount: dto.amount,
      startDate: dto.startDate ?? null,
      endDate: dto.endDate ?? null,
      createdByUserId: userId,
    });
    assertValidPeriod(fixedExpense);

    return this.fixedExpenses.save(fixedExpense);
  }

  async list(userId: string) {
    return this.fixedExpenses.find({
      where: { createdByUserId: userId },
      relations: { tenant: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, id: string) {
    const fixedExpense = await this.fixedExpenses.findOne({
      where: { id },
      relations: { tenant: true },
    });
    if (!fixedExpense) throw new NotFoundException('Fixed expense not found');
    if (fixedExpense.createdByUserId !== userId) {
      throw new ForbiddenException('Forbidden');
    }

    return fixedExpense;
  }

  async update(userId: string, id: string, dto: UpdateFixedExpenseDto) {
    const fixedExpense = await this.findOne(userId, id);

    if (dto.tenantId) {
      const tenant = await this.tenants.findOne({
        where: { id: dto.tenantId, createdByUserId: userId },
      });
      if (!tenant)
        throw new ForbiddenException('Tenant not found or not owned by user');
    }

    Object.assign(fixedExpense, dto);
    assertValidPeriod(fixedExpense);
    return this.fixedExpenses.save(fixedExpense);
  }

  async remove(userId: string, id: string) {
    const fixedExpense = await this.findOne(userId, id);
    await this.fixedExpenses.remove(fixedExpense);
    return { deleted: true };
  }
}
