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
import {
  StatementItem,
  StatementItemKind,
} from '../../infrastructure/persistence/typeorm/entities/statement-item.entity';
import { CreditCard } from '../../infrastructure/persistence/typeorm/entities/credit-card.entity';
import { Subscription } from '../../infrastructure/persistence/typeorm/entities/subscription.entity';
import { FixedExpense } from '../../infrastructure/persistence/typeorm/entities/fixed-expense.entity';
import {
  IncomeSource,
  IncomeSourceType,
} from '../../infrastructure/persistence/typeorm/entities/income-source.entity';
import { fromCents, splitInstallments, toCents } from '../utils/money';
import { monthPeriod } from '../utils/dates';
import { activeInPeriodSql, incomeInPeriodSql } from '../utils/report-periods';
import { directPurchasesInPeriod } from '../utils/direct-purchases';

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

  /**
   * Spending of the month per category, largest first: statement items of active
   * cards plus Pix/cash purchases dated in the month. Uncategorized amounts come
   * as categoryId null. Statement adjustments have no category and are not included.
   */
  async totalsByCategory(userId: string, year: number, month: number) {
    type Row = {
      categoryId: string | null;
      name: string | null;
      icon: string | null;
      totalAmount: string;
    };
    const itemRows = await this.items
      .createQueryBuilder('si')
      .innerJoin('si.statement', 's')
      .innerJoin('s.creditCard', 'cc')
      .leftJoin('si.category', 'c')
      .where('s.year = :year AND s.month = :month', { year, month })
      .andWhere('cc.createdByUserId = :uid', { uid: userId })
      .andWhere('cc.active = true')
      .select('si.categoryId', 'categoryId')
      .addSelect('c.name', 'name')
      .addSelect('c.icon', 'icon')
      .addSelect('COALESCE(SUM(si.amount), 0)', 'totalAmount')
      .groupBy('si.categoryId')
      .addGroupBy('c.name')
      .addGroupBy('c.icon')
      .getRawMany<Row>();

    const { periodStart, periodEnd } = monthPeriod(year, month);
    const directRows = await directPurchasesInPeriod(this.purchases, userId, periodStart, periodEnd)
      .leftJoin('dp.category', 'c')
      .select('dp.categoryId', 'categoryId')
      .addSelect('c.name', 'name')
      .addSelect('c.icon', 'icon')
      .addSelect('COALESCE(SUM(dp.totalAmount), 0)', 'totalAmount')
      .groupBy('dp.categoryId')
      .addGroupBy('c.name')
      .addGroupBy('c.icon')
      .getRawMany<Row>();

    const merged = new Map<string, Omit<Row, 'totalAmount'> & { cents: number }>();
    for (const r of [...itemRows, ...directRows]) {
      const key = r.categoryId ?? '';
      const cur = merged.get(key) ?? { categoryId: r.categoryId, name: r.name, icon: r.icon, cents: 0 };
      cur.cents += toCents(r.totalAmount);
      merged.set(key, cur);
    }
    return [...merged.values()]
      .filter((r) => r.cents !== 0)
      .sort((a, b) => b.cents - a.cents)
      .map(({ cents, ...r }) => ({ ...r, totalAmount: fromCents(cents) }));
  }

  async totalsByTenant(userId: string, year?: number, month?: number) {
    if (!year || !month) {
      return [];
    }

    const tenants = await this.tenants.find({
      where: { createdByUserId: userId },
      order: { name: 'ASC' },
    });

    const { periodStart, periodEnd } = monthPeriod(year, month);

    // Purchases and subscriptions come from the month's statement items, which
    // snapshot the tenant each amount is attributed to.
    const itemRows = await this.items
      .createQueryBuilder('si')
      .innerJoin('si.statement', 's')
      .innerJoin('s.creditCard', 'cc')
      .where('s.year = :year AND s.month = :month', { year, month })
      .andWhere('cc.createdByUserId = :uid', { uid: userId })
      .andWhere('cc.active = true')
      .andWhere('si.tenantId IS NOT NULL')
      .select('si.tenantId', 'tenantId')
      .addSelect('si.kind', 'kind')
      .addSelect('COALESCE(SUM(si.amount), 0)', 'totalAmount')
      .groupBy('si.tenantId')
      .addGroupBy('si.kind')
      .getRawMany<{
        tenantId: string;
        kind: StatementItemKind;
        totalAmount: string;
      }>();

    // Pix/cash purchases of the month count as purchases of their tenant.
    const directRows = await directPurchasesInPeriod(this.purchases, userId, periodStart, periodEnd)
      .select('dp.tenantId', 'tenantId')
      .addSelect('COALESCE(SUM(dp.totalAmount), 0)', 'totalAmount')
      .groupBy('dp.tenantId')
      .getRawMany<{ tenantId: string; totalAmount: string }>();

    const fixedExpenseRows = await this.fixedExpenses
      .createQueryBuilder('fixedExpense')
      .where('fixedExpense.createdByUserId = :uid', { uid: userId })
      .andWhere('fixedExpense.tenantId IS NOT NULL')
      .andWhere(activeInPeriodSql('fixedExpense'), { periodStart, periodEnd })
      .select('fixedExpense.tenantId', 'tenantId')
      .addSelect('COALESCE(SUM(fixedExpense.amount), 0)', 'totalAmount')
      .groupBy('fixedExpense.tenantId')
      .getRawMany<{
        tenantId: string;
        totalAmount: string;
      }>();

    const incomeSourceRows = await this.incomeSources
      .createQueryBuilder('incomeSource')
      .where('incomeSource.createdByUserId = :uid', { uid: userId })
      .andWhere('incomeSource.tenantId IS NOT NULL')
      .andWhere(incomeInPeriodSql('incomeSource'), {
        fixedType: IncomeSourceType.FIXED,
        oneTimeType: IncomeSourceType.ONE_TIME,
        periodStart,
        periodEnd,
      })
      .select('incomeSource.tenantId', 'tenantId')
      .addSelect('COALESCE(SUM(incomeSource.amount), 0)', 'totalAmount')
      .groupBy('incomeSource.tenantId')
      .getRawMany<{
        tenantId: string;
        totalAmount: string;
      }>();

    const centsBy = (rows: { tenantId: string; totalAmount: string }[]) =>
      new Map(rows.map((row) => [row.tenantId, toCents(row.totalAmount)]));
    const purchaseMap = centsBy(itemRows.filter((r) => r.kind === 'purchase'));
    for (const [tenantId, cents] of centsBy(directRows)) {
      purchaseMap.set(tenantId, (purchaseMap.get(tenantId) ?? 0) + cents);
    }
    const subsMap = centsBy(itemRows.filter((r) => r.kind === 'subscription'));
    const fixedExpenseMap = centsBy(fixedExpenseRows);
    const incomeSourceMap = centsBy(incomeSourceRows);

    return tenants.map((tenant) => {
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
        purchasesTotal: fromCents(purchasesTotal),
        subscriptionsTotal: fromCents(subscriptionsTotal),
        reportExpensesTotal: fromCents(reportExpensesTotal),
        fixedExpensesTotal: fromCents(fixedExpensesTotal),
        incomeSourcesTotal: fromCents(incomeSourcesTotal),
        accumulatedAmount: fromCents(accumulatedAmount),
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

    return { totalAmount: fromCents(toCents(p?.sum) + toCents(s?.sum)) };
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
      // Same split as statement generation, so the remainder is exact.
      const totalCents = toCents(purchase.totalAmount);
      const { per } = splitInstallments(totalCents, installmentsTotal);
      return sum + (totalCents - per * previousInstallments);
    }, 0);

    return { totalAmount: fromCents(total) };
  }
}
