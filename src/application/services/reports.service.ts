/** ReportsService.
 * Clean-architecture application service.
 * Exposes use-cases and enforces business rules.
 */
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Purchase } from '../../infrastructure/persistence/typeorm/entities/purchase.entity';
import { Tenant } from '../../infrastructure/persistence/typeorm/entities/tenant.entity';
import { Statement } from '../../infrastructure/persistence/typeorm/entities/statement.entity';
import { StatementItem } from '../../infrastructure/persistence/typeorm/entities/statement-item.entity';
import { CreditCard } from '../../infrastructure/persistence/typeorm/entities/credit-card.entity';
import { Subscription } from 'src/infrastructure/persistence/typeorm/entities/subscription.entity';
import { FixedExpense } from '../../infrastructure/persistence/typeorm/entities/fixed-expense.entity';
import {
  IncomeSource,
  IncomeSourceType,
} from '../../infrastructure/persistence/typeorm/entities/income-source.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Purchase)
    private readonly purchases: Repository<Purchase>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Statement)
    private readonly statements: Repository<Statement>,
    @InjectRepository(StatementItem)
    private readonly items: Repository<StatementItem>,
    @InjectRepository(CreditCard)
    private readonly cards: Repository<CreditCard>,
    @InjectRepository(Subscription)
    private readonly subs: Repository<Subscription>,
    @InjectRepository(FixedExpense)
    private readonly fixedExpenses: Repository<FixedExpense>,
    @InjectRepository(IncomeSource)
    private readonly incomeSources: Repository<IncomeSource>,
  ) {}

  async totalsByTenant(userId: string, year?: number, month?: number) {
    if (!year || !month) {
      return [];
    }

    const tenants = await this.tenants.find({
      where: { createdByUserId: userId },
      order: { name: 'ASC' },
    });

    const statements = await this.statements
      .createQueryBuilder('s')
      .innerJoin('s.creditCard', 'cc')
      .where('s.year = :year AND s.month = :month', { year, month })
      .andWhere('cc.createdByUserId = :uid', { uid: userId })
      .andWhere('cc.active = true')
      .select(['s.id AS id', 's.creditCardId AS "creditCardId"'])
      .getRawMany<{ id: string; creditCardId: string }>();

    const cardIds = [...new Set(statements.map((item) => item.creditCardId))];
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const periodEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const purchaseRows = await this.items
      .createQueryBuilder('si')
      .innerJoin('si.statement', 's')
      .innerJoin('si.purchase', 'p')
      .innerJoin('p.tenant', 't')
      .innerJoin('p.creditCard', 'cc')
      .where('s.year = :year AND s.month = :month', { year, month })
      .andWhere('cc.createdByUserId = :uid', { uid: userId })
      .andWhere('cc.active = true')
      .select('t.id', 'tenantId')
      .addSelect('COALESCE(SUM(CAST(si.amount AS numeric)), 0)', 'totalAmount')
      .groupBy('t.id')
      .getRawMany<{
        tenantId: string;
        totalAmount: string;
      }>();

    const subsRows =
      cardIds.length > 0
        ? await this.subs
            .createQueryBuilder('sub')
            .innerJoin('sub.creditCard', 'cc')
            .where('sub.createdByUserId = :uid', { uid: userId })
            .andWhere('sub.active = true')
            .andWhere('cc.active = true')
            .andWhere('sub.tenantId IS NOT NULL')
            .andWhere('sub.creditCardId IN (:...cardIds)', { cardIds })
            .select('sub.tenantId', 'tenantId')
            .addSelect(
              'COALESCE(SUM(CAST(sub.amount AS numeric)), 0)',
              'totalAmount',
            )
            .groupBy('sub.tenantId')
            .getRawMany<{
              tenantId: string;
              totalAmount: string;
            }>()
        : [];

    const fixedExpenseRows = await this.fixedExpenses
      .createQueryBuilder('fixedExpense')
      .where('fixedExpense.createdByUserId = :uid', { uid: userId })
      .andWhere('fixedExpense.tenantId IS NOT NULL')
      .select('fixedExpense.tenantId', 'tenantId')
      .addSelect(
        'COALESCE(SUM(CAST(fixedExpense.amount AS numeric)), 0)',
        'totalAmount',
      )
      .groupBy('fixedExpense.tenantId')
      .getRawMany<{
        tenantId: string;
        totalAmount: string;
      }>();

    const incomeSourceRows = await this.incomeSources
      .createQueryBuilder('incomeSource')
      .where('incomeSource.createdByUserId = :uid', { uid: userId })
      .andWhere('incomeSource.tenantId IS NOT NULL')
      .andWhere(
        `(incomeSource.incomeType = :fixedType OR (
          incomeSource.incomeType = :oneTimeType
          AND incomeSource.createdAt >= CAST(:periodStart AS date)
          AND incomeSource.createdAt < CAST(:periodEnd AS date)
        ))`,
        {
          fixedType: IncomeSourceType.FIXED,
          oneTimeType: IncomeSourceType.ONE_TIME,
          periodStart,
          periodEnd,
        },
      )
      .select('incomeSource.tenantId', 'tenantId')
      .addSelect(
        'COALESCE(SUM(CAST(incomeSource.amount AS numeric)), 0)',
        'totalAmount',
      )
      .groupBy('incomeSource.tenantId')
      .getRawMany<{
        tenantId: string;
        totalAmount: string;
      }>();

    const purchaseMap = new Map(
      purchaseRows.map((row) => [row.tenantId, Number(row.totalAmount || 0)]),
    );
    const subsMap = new Map(
      subsRows.map((row) => [row.tenantId, Number(row.totalAmount || 0)]),
    );
    const fixedExpenseMap = new Map(
      fixedExpenseRows.map((row) => [row.tenantId, Number(row.totalAmount || 0)]),
    );
    const incomeSourceMap = new Map(
      incomeSourceRows.map((row) => [row.tenantId, Number(row.totalAmount || 0)]),
    );

    return tenants
      .map((tenant) => {
        const purchasesTotal = purchaseMap.get(tenant.id) ?? 0;
        const subscriptionsTotal = subsMap.get(tenant.id) ?? 0;
        const fixedExpensesTotal = fixedExpenseMap.get(tenant.id) ?? 0;
        const incomeSourcesTotal = incomeSourceMap.get(tenant.id) ?? 0;
        const reportExpensesTotal = purchasesTotal + subscriptionsTotal;
        const accumulatedAmount =
          incomeSourcesTotal - fixedExpensesTotal - reportExpensesTotal;

        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          purchasesTotal: purchasesTotal.toFixed(2),
          subscriptionsTotal: subscriptionsTotal.toFixed(2),
          reportExpensesTotal: reportExpensesTotal.toFixed(2),
          fixedExpensesTotal: fixedExpensesTotal.toFixed(2),
          incomeSourcesTotal: incomeSourcesTotal.toFixed(2),
          accumulatedAmount: accumulatedAmount.toFixed(2),
        };
      });
  }

  async totalGlobal(userId: string, opts?: { statementId?: string }) {
    if (opts?.statementId) {
      const st = await this.statements.findOne({
        where: { id: opts.statementId },
        relations: { creditCard: true },
      });
      if (!st) throw new NotFoundException('Statement not found');
      if (st.creditCard.createdByUserId !== userId)
        throw new ForbiddenException();
      if (!st.creditCard.active) throw new NotFoundException('Statement not found');
      return { totalAmount: st.totalAmount };
    }

    const p = await this.purchases
      .createQueryBuilder('p')
      .innerJoin('p.creditCard', 'cc')
      .where('p.createdByUserId = :uid', { uid: userId })
      .andWhere('cc.active = true')
      .select('COALESCE(SUM(CAST(p.totalAmount AS numeric)),0)', 'sum')
      .getRawOne<{ sum: string }>();

    const s = await this.subs
      .createQueryBuilder('sub')
      .innerJoin('sub.creditCard', 'cc')
      .where('sub.createdByUserId = :uid', { uid: userId })
      .andWhere('sub.active = true')
      .andWhere('cc.active = true')
      .select('COALESCE(SUM(CAST(sub.amount AS numeric)),0)', 'sum')
      .getRawOne<{ sum: string }>();

    const total = Number(p?.sum || 0) + Number(s?.sum || 0);
    return { totalAmount: total.toFixed(2) };
  }

  async installmentsTotalFromMonth(
    userId: string,
    creditCardId: string,
    year: number,
    month: number,
    tenantId?: string,
  ) {
    const card = await this.cards.findOne({
      where: { id: creditCardId, createdByUserId: userId, active: true },
    });
    if (!card) {
      throw new ForbiddenException(
        'Credit card not found or not owned by user',
      );
    }

    if (tenantId) {
      const tenant = await this.tenants.findOne({
        where: { id: tenantId, createdByUserId: userId },
      });
      if (!tenant) {
        throw new ForbiddenException(
          'Tenant not found or not owned by user',
        );
      }
    }

    const referenceDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const query = this.purchases
      .createQueryBuilder('purchase')
      .where('purchase.creditCardId = :creditCardId', { creditCardId })
      .andWhere('purchase.createdByUserId = :userId', { userId })
      .andWhere('purchase.isInstallment = true')
      .andWhere('purchase.installmentsTotal > 0')
      .andWhere(
        "purchase.purchaseDate + purchase.installmentsTotal * INTERVAL '1 month' > CAST(:referenceDate AS date)",
        { referenceDate },
      );

    if (tenantId) {
      query.andWhere('purchase.tenantId = :tenantId', { tenantId });
    }

    const purchases = await query.getMany();

    const referenceIndex = year * 12 + month - 1;
    const total = purchases.reduce((sum, purchase) => {
      const [purchaseYear, purchaseMonth] = purchase.purchaseDate
        .slice(0, 7)
        .split('-')
        .map(Number);
      const purchaseIndex = purchaseYear * 12 + purchaseMonth - 1;
      const installmentsTotal = purchase.installmentsTotal ?? 0;
      const previousInstallments = Math.max(
        0,
        Math.min(referenceIndex - purchaseIndex, installmentsTotal),
      );
      const installmentAmount =
        Math.round((Number(purchase.totalAmount) / installmentsTotal) * 100) /
        100;
      const remainingAmount =
        Number(purchase.totalAmount) -
        installmentAmount * previousInstallments;

      return sum + remainingAmount;
    }, 0);

    return { totalAmount: total.toFixed(2) };
  }
}
