/** StatementsService
 * Clean-architecture application service.
 * Exposes use-cases and enforces business rules.
 */
import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { Statement } from '../../infrastructure/persistence/typeorm/entities/statement.entity';
import { StatementItem } from '../../infrastructure/persistence/typeorm/entities/statement-item.entity';
import { Purchase } from '../../infrastructure/persistence/typeorm/entities/purchase.entity';
import { CreditCard } from '../../infrastructure/persistence/typeorm/entities/credit-card.entity';
import { Subscription } from '../../infrastructure/persistence/typeorm/entities/subscription.entity';
import {
  fromCents,
  installmentAmountCents,
  toCents,
} from '../utils/money';
import { monthDiff } from '../utils/dates';

// statement_items.label is varchar(120)
const LABEL_MAX = 120;

@Injectable()
export class StatementsService {
  constructor(
    @InjectRepository(Statement)
    private readonly statements: Repository<Statement>,
    @InjectRepository(CreditCard)
    private readonly cards: Repository<CreditCard>,
    private readonly dataSource: DataSource,
  ) {}

  async generate(params: {
    creditCardId: string;
    userId: string;
    year: number;
    month: number;
    closingDate?: string;
    dueDate?: string;
    locked?: boolean;
  }) {
    const card = await this.cards.findOne({
      where: {
        id: params.creditCardId,
        createdByUserId: params.userId,
        active: true,
      },
    });
    if (!card)
      throw new ForbiddenException(
        'Credit card not found or not owned by user',
      );

    const statementId = await this.dataSource.transaction(async (manager) => {
      const stmtRepo = manager.getRepository(Statement);

      let st = await stmtRepo.findOne({
        where: {
          creditCardId: params.creditCardId,
          year: params.year,
          month: params.month,
        },
        lock: { mode: 'pessimistic_write' },
      });

      // Regeneration rebuilds items from scratch; never do that to a closed statement.
      if (st && (st.locked || st.paidAt)) {
        throw new ConflictException(
          'Statement is locked or paid and cannot be regenerated.',
        );
      }

      if (!st) {
        st = stmtRepo.create({
          creditCardId: params.creditCardId,
          year: params.year,
          month: params.month,
        });
      }

      Object.assign(st, {
        closingDate: params.closingDate ?? null,
        dueDate: params.dueDate ?? null,
        locked: params.locked ?? false,
        adjustmentAmount: '0.00',
        totalAmount: '0.00',
      });
      await stmtRepo.save(st);

      await this.rebuildItems(manager, st, params.userId);
      return st.id;
    });

    return this.findById(statementId, params.userId);
  }

  /**
   * Recomputes items and totals of every open (not locked, not paid) statement of
   * the given cards, keeping their dates and adjustment. Called whenever purchases
   * or subscriptions change, inside the caller's transaction.
   */
  async rebuildOpenStatements(
    manager: EntityManager,
    creditCardIds: string[],
    userId: string,
  ) {
    const ids = [...new Set(creditCardIds.filter(Boolean))];
    if (!ids.length) return;

    const open = await manager.getRepository(Statement).find({
      where: { creditCardId: In(ids), locked: false, paidAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    for (const st of open) {
      await this.rebuildItems(manager, st, userId);
    }
  }

  /** Purchases that appear in a locked or paid statement are frozen. */
  async assertPurchaseEditable(manager: EntityManager, purchaseId: string) {
    const closedItems = await manager
      .getRepository(StatementItem)
      .createQueryBuilder('si')
      .innerJoin('si.statement', 's')
      .where('si.purchaseId = :purchaseId', { purchaseId })
      .andWhere('(s.locked = true OR s.paidAt IS NOT NULL)')
      .getCount();
    if (closedItems > 0) {
      throw new ConflictException(
        'Purchase belongs to a locked or paid statement and cannot be changed.',
      );
    }
  }

  /**
   * Replaces the statement's items with the purchases/installments that fall in its
   * month plus a snapshot of the card's active subscriptions, then sets
   * totalAmount = sum(items) + adjustmentAmount.
   */
  private async rebuildItems(
    manager: EntityManager,
    st: Statement,
    userId: string,
  ) {
    const itemRepo = manager.getRepository(StatementItem);
    await itemRepo.delete({ statementId: st.id });

    const targetYm = `${st.year}-${String(st.month).padStart(2, '0')}`;
    const purchases = await manager.getRepository(Purchase).find({
      where: { creditCardId: st.creditCardId, createdByUserId: userId },
      order: { purchaseDate: 'ASC' },
    });
    const subscriptions = await manager.getRepository(Subscription).find({
      where: {
        creditCardId: st.creditCardId,
        createdByUserId: userId,
        active: true,
      },
      order: { description: 'ASC' },
    });

    const newItems: StatementItem[] = [];
    for (const p of purchases) {
      if (!p.isInstallment) {
        if (p.purchaseDate.slice(0, 7) === targetYm) {
          newItems.push(
            itemRepo.create({
              statementId: st.id,
              kind: 'purchase',
              purchaseId: p.id,
              tenantId: p.tenantId,
              label: 'Compra à vista',
              amount: p.totalAmount,
              installmentNumber: null,
            }),
          );
        }
      } else {
        const parts = p.installmentsTotal ?? 0;
        if (parts < 1) continue;

        const diff = monthDiff(p.purchaseDate, `${targetYm}-01`);
        if (diff < 0 || diff >= parts) continue;

        const amount = installmentAmountCents(
          toCents(p.totalAmount),
          parts,
          diff + 1,
        );
        newItems.push(
          itemRepo.create({
            statementId: st.id,
            kind: 'purchase',
            purchaseId: p.id,
            tenantId: p.tenantId,
            label: `Parcela ${diff + 1}/${parts}`,
            amount: fromCents(amount),
            installmentNumber: diff + 1,
          }),
        );
      }
    }

    for (const sub of subscriptions) {
      newItems.push(
        itemRepo.create({
          statementId: st.id,
          kind: 'subscription',
          subscriptionId: sub.id,
          tenantId: sub.tenantId ?? null,
          label: sub.description.slice(0, LABEL_MAX),
          amount: sub.amount,
          installmentNumber: null,
        }),
      );
    }

    if (newItems.length) await itemRepo.save(newItems);

    const itemsCents = newItems.reduce((acc, it) => acc + toCents(it.amount), 0);
    st.totalAmount = fromCents(itemsCents + toCents(st.adjustmentAmount));
    await manager.getRepository(Statement).save(st);
  }

  async findById(id: string, userId: string) {
    const st = await this.statements.findOne({
      where: { id },
      relations: { items: true, creditCard: true },
    });
    if (!st) throw new NotFoundException();
    if (st.creditCard.createdByUserId !== userId)
      throw new ForbiddenException();
    if (!st.creditCard.active) throw new NotFoundException();
    return st;
  }

  async update(id: string, userId: string, patch: Partial<Statement>) {
    const st = await this.findById(id, userId);

    if (
      st.locked &&
      (patch.closingDate !== undefined ||
        patch.dueDate !== undefined ||
        patch.adjustmentAmount !== undefined)
    ) {
      throw new ConflictException(
        'Statement is locked. Unlock it before changing dates or adjustment.',
      );
    }

    if (st.paidAt && patch.locked === false) {
      throw new ConflictException('Paid statement cannot be unlocked.');
    }

    if (patch.adjustmentAmount !== undefined) {
      const delta =
        toCents(patch.adjustmentAmount) - toCents(st.adjustmentAmount);
      st.totalAmount = fromCents(toCents(st.totalAmount) + delta);
      st.adjustmentAmount = patch.adjustmentAmount as any;
      const { adjustmentAmount, ...rest } = patch as any;
      Object.assign(st, rest);
      return this.statements.save(st);
    }

    Object.assign(st, patch);
    return this.statements.save(st);
  }

  async pay(id: string, userId: string, amount: string, paidAt?: string) {
    await this.findById(id, userId);

    await this.dataSource.transaction(async (manager) => {
      const stmtRepo = manager.getRepository(Statement);
      const itemRepo = manager.getRepository(StatementItem);
      const purchaseRepo = manager.getRepository(Purchase);

      // Recarrega com lock de linha: pagamentos concorrentes são serializados aqui
      const stmt = await stmtRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!stmt)
        throw new ConflictException('Statement not found during payment.');

      if (!stmt.locked) {
        throw new BadRequestException(
          'Statement must be locked before payment.',
        );
      }

      // Se já estava paga, apenas atualiza o valor/data sem tocar nas parcelas
      if (!stmt.paidAt) {
        const items = await itemRepo.find({
          where: { statementId: id },
          relations: { purchase: true },
        });

        const toBump = new Map<string, Purchase>();

        for (const it of items) {
          const p = it.purchase;
          if (!p || !p.isInstallment || it.installmentNumber == null) continue;

          // Pagar a parcela k significa que ao menos k parcelas estão pagas;
          // nunca diminui, então pagar faturas fora de ordem é seguro.
          const total = p.installmentsTotal ?? 0;
          const paidUpTo = Math.min(it.installmentNumber, total);
          if (paidUpTo > (p.installmentsPaid ?? 0)) {
            p.installmentsPaid = paidUpTo;
            toBump.set(p.id, p);
          }
        }

        if (toBump.size > 0) {
          await purchaseRepo.save([...toBump.values()]);
        }
      }

      stmt.paidAmount = amount;
      stmt.paidAt = paidAt ? new Date(`${paidAt}T00:00:00Z`) : new Date();
      await stmtRepo.save(stmt);
    });

    return this.findById(id, userId);
  }

  async list(
    userId: string,
    opts: { creditCardId?: string; year?: number; month?: number },
  ) {
    if (opts.creditCardId) {
      const card = await this.cards.findOne({
        where: { id: opts.creditCardId, createdByUserId: userId, active: true },
      });
      if (!card) throw new ForbiddenException();
    }

    if (opts.creditCardId && opts.year && opts.month) {
      const one = await this.statements.findOne({
        where: {
          creditCardId: opts.creditCardId,
          year: opts.year,
          month: opts.month,
        },
        relations: { items: false },
      });
      if (!one) throw new NotFoundException('Statement not found');
      return one;
    }

    const qb = this.statements
      .createQueryBuilder('statement')
      .innerJoinAndSelect('statement.creditCard', 'creditCard')
      .where('creditCard.createdByUserId = :userId', { userId })
      .andWhere('creditCard.active = true');

    if (opts.creditCardId) {
      qb.andWhere('statement.creditCardId = :creditCardId', {
        creditCardId: opts.creditCardId,
      });
    }

    if (opts.year) {
      qb.andWhere('statement.year = :year', { year: opts.year });
    }

    if (opts.month) {
      qb.andWhere('statement.month = :month', { month: opts.month });
    }

    return qb
      .orderBy('statement.year', 'DESC')
      .addOrderBy('statement.month', 'DESC')
      .addOrderBy('creditCard.nickname', 'ASC')
      .getMany();
  }
}
