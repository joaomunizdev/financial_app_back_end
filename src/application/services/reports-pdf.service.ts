import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Response } from 'express';
import { Statement } from '../../infrastructure/persistence/typeorm/entities/statement.entity';
import {
  StatementItem,
  StatementItemKind,
} from '../../infrastructure/persistence/typeorm/entities/statement-item.entity';
import { Tenant } from '../../infrastructure/persistence/typeorm/entities/tenant.entity';
import { CreditCard } from '../../infrastructure/persistence/typeorm/entities/credit-card.entity';
import { FixedExpense } from '../../infrastructure/persistence/typeorm/entities/fixed-expense.entity';
import {
  IncomeSource,
  IncomeSourceType,
} from '../../infrastructure/persistence/typeorm/entities/income-source.entity';
import { toCents } from '../utils/money';
import { monthPeriod } from '../utils/dates';
import { activeInPeriodSql, incomeInPeriodSql } from '../utils/report-periods';
import { directPurchasesInPeriod } from '../utils/direct-purchases';
import {
  TenantReportEntry,
  createTenantReportPdf,
} from '../../infrastructure/pdf/tenant-report-pdf';
import { Purchase } from '../../infrastructure/persistence/typeorm/entities/purchase.entity';

const DIRECT_METHOD_LABEL: Record<string, string> = { pix: 'Pix', cash: 'Dinheiro' };


@Injectable()
export class ReportsPdfService {
  constructor(
    @InjectRepository(Statement)
    private readonly statements: Repository<Statement>,
    @InjectRepository(StatementItem)
    private readonly items: Repository<StatementItem>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(CreditCard)
    private readonly cards: Repository<CreditCard>,
    @InjectRepository(FixedExpense)
    private readonly fixedExpenses: Repository<FixedExpense>,
    @InjectRepository(IncomeSource)
    private readonly incomeSources: Repository<IncomeSource>,
    @InjectRepository(Purchase)
    private readonly purchases: Repository<Purchase>,
  ) {}



  /**
   * PDF mensal por tenant, agregando todas as faturas (statements) do usuário
   * para (year, month), com DETALHES de compras (StatementItem) e assinaturas por cartão.
   */
  async tenantMonthlyPdf(
    userId: string,
    tenantId: string,
    year: number,
    month: number,
    res: Response,
  ) {
    if (!year || !month || month < 1 || month > 12) {
      throw new BadRequestException('Invalid year/month');
    }

    const tenant = await this.tenants.findOne({
      where: { id: tenantId, createdByUserId: userId },
    });
    if (!tenant)
      throw new NotFoundException('Tenant not found or not owned by user');

    const stmts = await this.statements
      .createQueryBuilder('s')
      .innerJoin('s.creditCard', 'cc')
      .where('s.year = :y AND s.month = :m', { y: year, m: month })
      .andWhere('cc.createdByUserId = :uid', { uid: userId })
      .andWhere('cc.active = true')
      .select(['s.id AS id', 's.creditCardId AS "creditCardId"'])
      .getRawMany<{ id: string; creditCardId: string }>();

    const { periodStart, periodEnd } = monthPeriod(year, month);
    // Pix/cash purchases of the tenant in the month (they have no statement).
    const directRows = await directPurchasesInPeriod(this.purchases, userId, periodStart, periodEnd)
      .andWhere('dp.tenantId = :tid', { tid: tenantId })
      .orderBy('dp.purchaseDate', 'ASC')
      .getMany();

    if (stmts.length === 0 && directRows.length === 0) {
      throw new NotFoundException('No statements for this month');
    }

    const cardIds = [...new Set(stmts.map((s) => s.creditCardId))];
    const cards = cardIds.length ? await this.cards.findBy({ id: In(cardIds) }) : [];
    const cardName = (id: string) =>
      cards.find((c) => c.id === id)?.nickname || id;

    // Purchases and subscriptions of the month come from statement items, which
    // snapshot the tenant each amount is attributed to.
    const itemRows = await this.items
      .createQueryBuilder('si')
      .innerJoin('si.statement', 's')
      .innerJoin('s.creditCard', 'cc')
      .leftJoin('si.purchase', 'p')
      .where('s.year = :y AND s.month = :m', { y: year, m: month })
      .andWhere('cc.createdByUserId = :uid', { uid: userId })
      .andWhere('cc.active = true')
      .andWhere('si.tenantId = :tid', { tid: tenantId })
      .select([
        'si.kind AS "kind"',
        'cc.id AS "creditCardId"',
        `CASE WHEN si.kind = 'purchase' THEN CONCAT_WS(' - ', p.description, si.label) ELSE si.label END AS "label"`,
        'COALESCE(si.amount, 0) AS "amount"',
      ])
      .orderBy('cc.nickname', 'ASC')
      .addOrderBy('si.id', 'ASC')
      .getRawMany<{
        kind: StatementItemKind;
        creditCardId: string;
        label: string | null;
        amount: string;
      }>();

    const reportRows: TenantReportEntry[] = [
      ...itemRows.map((r) => ({
        label:
          r.label?.trim() || (r.kind === 'purchase' ? 'Compra' : 'Assinatura'),
        amountCents: toCents(r.amount),
        origin: cardName(r.creditCardId),
        kind: r.kind,
      })),
      ...directRows.map((p) => ({
        label: p.description.trim() || 'Compra',
        amountCents: toCents(p.totalAmount),
        origin: DIRECT_METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod,
        kind: 'purchase' as const,
      })),
    ];

    reportRows.sort((a, b) => a.label.localeCompare(b.label));

    const fixedExpenseRows = await this.fixedExpenses
      .createQueryBuilder('fixedExpense')
      .where('fixedExpense.createdByUserId = :userId', { userId })
      .andWhere('fixedExpense.tenantId = :tenantId', { tenantId })
      .andWhere(activeInPeriodSql('fixedExpense'), { periodStart, periodEnd })
      .orderBy('fixedExpense.description', 'ASC')
      .getMany();

    const incomeSourceRows = await this.incomeSources
      .createQueryBuilder('incomeSource')
      .where('incomeSource.createdByUserId = :userId', { userId })
      .andWhere('incomeSource.tenantId = :tenantId', { tenantId })
      .andWhere(incomeInPeriodSql('incomeSource'), {
        fixedType: IncomeSourceType.FIXED,
        oneTimeType: IncomeSourceType.ONE_TIME,
        periodStart,
        periodEnd,
      })
      .orderBy('incomeSource.description', 'ASC')
      .getMany();

    const monthStr = String(month).padStart(2, '0');
    const filename = `relatório_${tenant.name.replace(
      /\s+/g,
      '_',
    )}_${year}-${monthStr}.pdf`;
    // ASCII fallback + RFC 5987 UTF-8 name, so tenant names can't break the header
    const asciiFilename = filename
      .normalize('NFD')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/["\\]/g, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

    const doc = createTenantReportPdf({
      tenantName: tenant.name,
      year,
      month,
      generatedAt: new Date(),
      entries: reportRows,
      incomes: incomeSourceRows.map((r) => ({ description: r.description, amountCents: toCents(r.amount) })),
      fixedExpenses: fixedExpenseRows.map((r) => ({ description: r.description, amountCents: toCents(r.amount) })),
    });
    doc.pipe(res);
    doc.end();
  }
}
