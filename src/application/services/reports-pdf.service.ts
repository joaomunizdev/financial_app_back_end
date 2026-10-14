import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as path from 'path';
import PDFDocument = require('pdfkit');
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

// Resolves to src/assets (ts-node) or dist/assets (build copies assets, see nest-cli.json)
const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logo.png');

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
  ) {}

  private brl(n: number) {
    try {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(n);
    } catch {
      return `R$ ${(+n || 0).toFixed(2)}`;
    }
  }

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

    if (stmts.length === 0) {
      throw new NotFoundException('No statements for this month');
    }

    const cardIds = [...new Set(stmts.map((s) => s.creditCardId))];
    const cards = await this.cards.findBy({ id: In(cardIds) });
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

    type ReportRow = {
      label: string;
      amount: number;
      cardName: string;
    };
    const reportRows: ReportRow[] = itemRows.map((r) => ({
      label:
        r.label?.trim() || (r.kind === 'purchase' ? 'Compra' : 'Assinatura'),
      amount: Number(r.amount || 0),
      cardName: cardName(r.creditCardId),
    }));

    reportRows.sort((a, b) => a.label.localeCompare(b.label));

    const sumCents = (rows: { amount: string | null }[]) =>
      rows.reduce((sum, row) => sum + toCents(row.amount), 0);
    const grandPurchasesCents = sumCents(
      itemRows.filter((r) => r.kind === 'purchase'),
    );
    const grandSubsCents = sumCents(
      itemRows.filter((r) => r.kind === 'subscription'),
    );
    const grandTotalCents = grandPurchasesCents + grandSubsCents;

    const { periodStart, periodEnd } = monthPeriod(year, month);

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

    const showBalanceSection =
      fixedExpenseRows.length > 0 || incomeSourceRows.length > 0;
    const totalFixedExpensesCents = sumCents(fixedExpenseRows);
    const totalIncomeSourcesCents = sumCents(incomeSourceRows);
    const totalExpensesCents = grandTotalCents + totalFixedExpensesCents;

    const grandPurchases = grandPurchasesCents / 100;
    const grandSubs = grandSubsCents / 100;
    const grandTotal = grandTotalCents / 100;
    const totalFixedExpenses = totalFixedExpensesCents / 100;
    const totalIncomeSources = totalIncomeSourcesCents / 100;
    const totalExpenses = totalExpensesCents / 100;
    const remainingBalance =
      (totalIncomeSourcesCents - totalExpensesCents) / 100;

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

    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: { Title: `Relatório Mensal ${tenant.name} - ${year}-${monthStr}` },
    });
    doc.pipe(res);
    const LM = 40;
    const RM = 555;
    const col = { label: 50, amount: 500 };
    const ensureSpace = (extra = 22) => {
      if (doc.y > doc.page.height - 60 - extra) doc.addPage();
    };
    const line = (y?: number, color = '#999') => {
      const yy = y ?? doc.y;
      doc.moveTo(LM, yy).lineTo(RM, yy).strokeColor(color).stroke();
    };

    doc
      .image(LOGO_PATH, 20, doc.y - 60, { width: 120 })
      .moveUp()
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#000')
      .text('Relatório Mensal', LM + 195, doc.y + 20);

    doc.moveDown(0.5);
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#000')
      .text(`Responsável: ${tenant.name}`, LM, doc.y)
      .text(`Mês: ${monthStr}/${year}`, LM, doc.y);

    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(12).text('Lancamentos do periodo', col.label, doc.y);
    doc.moveDown(0.1);
    line();
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10);

    if (reportRows.length === 0) {
      ensureSpace();
      doc.text('— Sem lancamentos —', col.label, doc.y);
    } else {
      for (const row of reportRows) {
        ensureSpace(18);
        doc.text(`${row.label} (${row.cardName})`, col.label, doc.y, { width: 420 });
        doc.text(this.brl(row.amount), col.amount, doc.y, {
          width: 70,
          align: 'right',
        });
        doc.moveDown(0.1);
      }
    }

    doc.moveDown(0.8);
    line(undefined, '#333');
    doc.moveDown(0.4);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Total geral', col.label, doc.y);
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(11).text('Compras', col.label, doc.y);
    doc.text(this.brl(grandPurchases), col.amount, doc.y, {
      width: 70,
      align: 'right',
    });
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').text('Assinaturas', col.label, doc.y);
    doc.text(this.brl(grandSubs), col.amount, doc.y, {
      width: 70,
      align: 'right',
    });
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').text('Despesas fixas', col.label, doc.y);
    doc.text(this.brl(totalFixedExpenses), col.amount, doc.y, {
      width: 70,
      align: 'right',
    });
    doc.moveDown(0.3);
    line();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(12).text('Total', col.label, doc.y);
    doc.text(this.brl(totalExpenses), col.amount, doc.y, {
      width: 70,
      align: 'right',
    });

    if (showBalanceSection) {
      doc.moveDown(1);
      ensureSpace(180);
      line(undefined, '#333');
      doc.moveDown(0.5);
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .text('Saldo do responsável', col.label, doc.y);
      doc.moveDown(0.3);

      doc.font('Helvetica-Bold').fontSize(11).text('Fontes de renda', col.label, doc.y);
      doc.moveDown(0.1);
      line();
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10);

      for (const incomeSource of incomeSourceRows) {
        ensureSpace(18);
        doc.text(incomeSource.description, col.label, doc.y, { width: 420 });
        doc.text(this.brl(Number(incomeSource.amount || 0)), col.amount, doc.y, {
          width: 70,
          align: 'right',
        });
        doc.moveDown(0.1);
      }

      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').text('Total de renda', col.label, doc.y);
      doc.text(this.brl(totalIncomeSources), col.amount, doc.y, {
        width: 70,
        align: 'right',
      });

      doc.moveDown(0.5);
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('Despesas fixas', col.label, doc.y);
      doc.moveDown(0.1);
      line();
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10);

      for (const fixedExpense of fixedExpenseRows) {
        ensureSpace(18);
        doc.text(fixedExpense.description, col.label, doc.y, { width: 420 });
        doc.text(this.brl(Number(fixedExpense.amount || 0)), col.amount, doc.y, {
          width: 70,
          align: 'right',
        });
        doc.moveDown(0.1);
      }

      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').text('Total despesas fixas', col.label, doc.y);
      doc.text(this.brl(totalFixedExpenses), col.amount, doc.y, {
        width: 70,
        align: 'right',
      });

      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').text('Gastos no relatorio', col.label, doc.y);
      doc.text(this.brl(grandTotal), col.amount, doc.y, {
        width: 70,
        align: 'right',
      });

      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').text('Total de despesas', col.label, doc.y);
      doc.text(this.brl(totalExpenses), col.amount, doc.y, {
        width: 70,
        align: 'right',
      });

      doc.moveDown(0.3);
      line();
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(12).text('Saldo restante', col.label, doc.y);
      doc.text(this.brl(remainingBalance), col.amount, doc.y, {
        width: 70,
        align: 'right',
      });
    }

    doc.end();
  }
}
