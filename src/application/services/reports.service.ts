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
import { IncomeSource } from '../../infrastructure/persistence/typeorm/entities/income-source.entity';

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
}
