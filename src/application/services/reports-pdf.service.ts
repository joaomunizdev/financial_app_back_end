import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import PDFDocument = require('pdfkit');
import { Response } from 'express';
import { Statement } from '../../infrastructure/persistence/typeorm/entities/statement.entity';
import { StatementItem } from '../../infrastructure/persistence/typeorm/entities/statement-item.entity';
import { Subscription } from '../../infrastructure/persistence/typeorm/entities/subscription.entity';
import { Purchase } from '../../infrastructure/persistence/typeorm/entities/purchase.entity';
import { Tenant } from '../../infrastructure/persistence/typeorm/entities/tenant.entity';
import { CreditCard } from '../../infrastructure/persistence/typeorm/entities/credit-card.entity';

@Injectable()
export class ReportsPdfService {
  constructor(
    @InjectRepository(Statement)
    private readonly statements: Repository<Statement>,
    @InjectRepository(StatementItem)
    private readonly items: Repository<StatementItem>,
    @InjectRepository(Subscription)
    private readonly subs: Repository<Subscription>,
    @InjectRepository(Purchase)
    private readonly purchases: Repository<Purchase>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(CreditCard)
    private readonly cards: Repository<CreditCard>,
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
      .select(['s.id AS id', 's."credit_card_id" AS "creditCardId"'])
      .getRawMany<{ id: string; creditCardId: string }>();

    if (stmts.length === 0) {
      throw new NotFoundException('No statements for this month');
    }

    const cardIds = [...new Set(stmts.map((s) => s.creditCardId))];
    const cards = await this.cards.findBy({ id: In(cardIds) });
    const cardName = (id: string) =>
      cards.find((c) => c.id === id)?.nickname || id;

    const purchaseRows = await this.items
      .createQueryBuilder('si')
      .innerJoin('si.statement', 's')
      .innerJoin('si.purchase', 'p')
      .innerJoin('p.creditCard', 'cc')
      .where('s.year = :y AND s.month = :m', { y: year, m: month })
      .andWhere('cc.createdByUserId = :uid', { uid: userId })
      .andWhere('p.tenantId = :tid', { tid: tenantId })
      .select([
        'si.id AS "statementItemId"',
        'cc.id AS "creditCardId"',
        `CONCAT_WS(' - ', p.description, si.label) AS "label"`,
        'COALESCE(CAST(si.amount AS numeric), 0) AS "amount"',
        'p.purchaseDate AS "purchaseDate"',
      ])
      .orderBy('cc.nickname', 'ASC')
      .addOrderBy('p.purchaseDate', 'ASC')
      .addOrderBy('si.id', 'ASC')
      .getRawMany<{
        statementItemId: string;
        creditCardId: string;
        label: string | null;
        amount: string;
        purchaseDate: string | null;
      }>();

    const subsRows = await this.subs
      .createQueryBuilder('sub')
      .where('sub.createdByUserId = :uid', { uid: userId })
      .andWhere('sub.active = true')
      .andWhere('sub.tenantId = :tid', { tid: tenantId })
      .andWhere('sub."creditcardid" IN (:...cids)', { cids: cardIds })
      .select([
        'sub."creditcardid" AS "creditCardId"',
        'sub.description AS "description"',
        'COALESCE(CAST(sub.amount AS numeric), 0) AS "amount"',
      ])
      .orderBy('sub.description', 'ASC')
      .getRawMany<{
        creditCardId: string;
        description: string | null;
        amount: string;
      }>();

    type Row = { label: string; amount: number };
    type Bucket = {
      purchases: Row[];
      subscriptions: Row[];
      subtotalPurchases: number;
      subtotalSubs: number;
      subtotal: number;
    };
    const byCard: Record<string, Bucket> = {};
    const ensureCard = (cid?: string | null) => {
      if (!cid) return;
      if (!byCard[cid]) {
        byCard[cid] = {
          purchases: [],
          subscriptions: [],
          subtotalPurchases: 0,
          subtotalSubs: 0,
          subtotal: 0,
        };
      }
    };
    for (const c of cardIds) ensureCard(c);

    const fmtDate = (d?: string | null) =>
      d ? new Date(d).toISOString().slice(0, 10) : '';
    for (const r of purchaseRows) {
      const cid = r.creditCardId;
      if (!cid) continue;
      ensureCard(cid);
      const amt = Number(r.amount || 0);
      const label = r.label?.trim() || 'Compra';
      byCard[cid].purchases.push({ label, amount: amt });
      byCard[cid].subtotalPurchases += amt;
    }

    for (const r of subsRows) {
      const cid = r.creditCardId;
      if (!cid) continue;
      ensureCard(cid);
      const amt = Number(r.amount || 0);
      const label = r.description?.trim() || 'Assinatura';
      byCard[cid].subscriptions.push({ label, amount: amt });
      byCard[cid].subtotalSubs += amt;
    }

    let grandPurchases = 0;
    let grandSubs = 0;
    for (const cid of Object.keys(byCard)) {
      byCard[cid].subtotal =
        byCard[cid].subtotalPurchases + byCard[cid].subtotalSubs;
      grandPurchases += byCard[cid].subtotalPurchases;
      grandSubs += byCard[cid].subtotalSubs;
    }
    const grandTotal = grandPurchases + grandSubs;

    const monthStr = String(month).padStart(2, '0');
    const filename = `relatório_${tenant.name.replace(
      /\s+/g,
      '_',
    )}_${year}-${monthStr}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

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
      .image('src/assets/logo.png', 20, doc.y - 60, { width: 120 })
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

    const cardsSorted = [...cardIds].sort((a, b) =>
      cardName(a).localeCompare(cardName(b)),
    );

    for (const cid of cardsSorted) {
      const sec = byCard[cid];
      if (!sec) continue;

      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(`Cartão: ${cardName(cid)}`, LM, doc.y, { underline: true });
      doc.moveDown(0.4);

      doc.font('Helvetica-Bold').fontSize(11).text('Compras', col.label, doc.y);
      doc.moveDown(0.1);
      line();
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10);

      if (sec.purchases.length === 0) {
        ensureSpace();
        doc.text('— Sem compras —', col.label, doc.y);
      } else {
        for (const r of sec.purchases) {
          ensureSpace(18);
          doc.text(r.label, col.label, doc.y, { width: 420 });
          doc.text(this.brl(r.amount), col.amount, doc.y, {
            width: 70,
            align: 'right',
          });
          doc.moveDown(0.1);
        }
      }

      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').text('Subtotal compras', col.label, doc.y);
      doc.text(this.brl(sec.subtotalPurchases), col.amount, doc.y, {
        width: 70,
        align: 'right',
      });
      doc.moveDown(0.5);

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('Assinaturas', col.label, doc.y);
      doc.moveDown(0.1);
      line();
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10);

      if (sec.subscriptions.length === 0) {
        ensureSpace();
        doc.text('— Sem assinaturas —', col.label, doc.y);
      } else {
        for (const r of sec.subscriptions) {
          ensureSpace(18);
          doc.text(r.label, col.label, doc.y, { width: 420 });
          doc.text(this.brl(r.amount), col.amount, doc.y, {
            width: 70,
            align: 'right',
          });
          doc.moveDown(0.1);
        }
      }

      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').text('Subtotal assinaturas', col.label, doc.y);
      doc.text(this.brl(sec.subtotalSubs), col.amount, doc.y, {
        width: 70,
        align: 'right',
      });

      doc.moveDown(0.4);
      line();
      doc.moveDown(0.2);

      doc.font('Helvetica-Bold').fontSize(11);
      doc.text('Total Cartão', col.label, doc.y);
      doc.text(this.brl(sec.subtotal), col.amount, doc.y, {
        width: 70,
        align: 'right',
      });

      doc.moveDown(0.8);
    }

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
    doc.moveDown(0.3);
    line();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(12).text('Total', col.label, doc.y);
    doc.text(this.brl(grandTotal), col.amount, doc.y, {
      width: 70,
      align: 'right',
    });

    doc.end();
  }
}
