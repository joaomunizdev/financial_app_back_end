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
import { Repository } from 'typeorm';
import { Statement } from '../../infrastructure/persistence/typeorm/entities/statement.entity';
import { StatementItem } from '../../infrastructure/persistence/typeorm/entities/statement-item.entity';
import { Purchase } from '../../infrastructure/persistence/typeorm/entities/purchase.entity';
import { CreditCard } from '../../infrastructure/persistence/typeorm/entities/credit-card.entity';
import { Subscription } from '../../infrastructure/persistence/typeorm/entities/subscription.entity';

function monthDiff(a: string, b: string) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

function yyyymmdd(y: number, m: number) {
  const mm = String(m).padStart(2, '0');
  return `${y}-${mm}-01`;
}

@Injectable()
export class StatementsService {
  constructor(
    @InjectRepository(Statement)
    private readonly statements: Repository<Statement>,
    @InjectRepository(StatementItem)
    private readonly items: Repository<StatementItem>,
    @InjectRepository(Purchase)
    private readonly purchases: Repository<Purchase>,
    @InjectRepository(CreditCard)
    private readonly cards: Repository<CreditCard>,
    @InjectRepository(Subscription)
    private readonly subs: Repository<Subscription>,
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
      where: { id: params.creditCardId, createdByUserId: params.userId },
    });
    if (!card)
      throw new ForbiddenException(
        'Credit card not found or not owned by user',
      );

    const exists = await this.statements.findOne({
      where: {
        creditCardId: params.creditCardId,
        year: params.year,
        month: params.month,
      },
    });
    if (exists) throw new ConflictException('Statement already exists');

    const st = this.statements.create({
      creditCardId: params.creditCardId,
      year: params.year,
      month: params.month,
      closingDate: params.closingDate ?? null,
      dueDate: params.dueDate ?? null,
      locked: params.locked ?? false,
      adjustmentAmount: '0.00',
      totalAmount: '0.00',
    });
    await this.statements.save(st);

    const targetYm = `${params.year}-${String(params.month).padStart(2, '0')}`;
    const purchases = await this.purchases.find({
      where: {
        creditCardId: params.creditCardId,
        createdByUserId: params.userId,
      },
      order: { purchaseDate: 'ASC' },
    });

    const newItems: StatementItem[] = [];
    for (const p of purchases) {
      if (!p.isInstallment) {
        if (p.purchaseDate.slice(0, 7) === targetYm) {
          newItems.push(
            this.items.create({
              statementId: st.id,
              purchaseId: p.id,
              label: 'Cash purchase',
              amount: p.totalAmount,
            }),
          );
        }
      } else {
        const total = Number(p.totalAmount);
        const parts = p.installmentsTotal ?? 0;
        if (parts < 1) continue;

        const per = Math.round((total / parts) * 100) / 100;
        const last = Math.round((total - per * (parts - 1)) * 100) / 100;

        const baseYm = `${p.purchaseDate.slice(0, 7)}`;
        const diff = monthDiff(`${baseYm}-01`, `${targetYm}-01`);
        if (diff < 0 || diff >= parts) continue;

        const amount = diff === parts - 1 ? last : per;
        newItems.push(
          this.items.create({
            statementId: st.id,
            purchaseId: p.id,
            label: `Installment ${diff + 1}/${parts}`,
            amount: amount.toFixed(2),
          }),
        );
      }
    }
    if (newItems.length) await this.items.save(newItems);

    const purchasesSum = newItems.reduce(
      (acc, it) => acc + Number(it.amount),
      0,
    );

    const rawSubsSum = await this.subs
      .createQueryBuilder('s')
      .select('COALESCE(SUM(CAST(s.amount as numeric)), 0)', 'sum')
      .where('s.creditcardid = :card', { card: params.creditCardId })
      .andWhere('s.createdbyuserid = :uid', { uid: params.userId })
      .andWhere('s.active = true')
      .getRawOne<{ sum: string }>();
    const subsSumRaw = rawSubsSum?.sum ?? '0';

    const subsSum = Number(subsSumRaw || 0);

    st.totalAmount = (
      purchasesSum +
      subsSum +
      Number(st.adjustmentAmount)
    ).toFixed(2);
    await this.statements.save(st);

    return this.findById(st.id, params.userId);
  }

  async listByCard(userId: string, creditCardId: string) {
    const card = await this.cards.findOne({
      where: { id: creditCardId, createdByUserId: userId },
    });
    if (!card) throw new ForbiddenException();
    return this.statements.find({
      where: { creditCardId },
      order: { year: 'DESC', month: 'DESC' },
    });
  }

  async findById(id: string, userId: string) {
    const st = await this.statements.findOne({
      where: { id },
      relations: { items: true, creditCard: true },
    });
    if (!st) throw new NotFoundException();
    if (st.creditCard.createdByUserId !== userId)
      throw new ForbiddenException();
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
    }

    if (patch.adjustmentAmount !== undefined) {
      const oldAdj = Number(st.adjustmentAmount || 0);
      const newAdj = Number(patch.adjustmentAmount || 0);
      const delta = newAdj - oldAdj;
      st.totalAmount = (Number(st.totalAmount || 0) + delta).toFixed(2);
      st.adjustmentAmount = patch.adjustmentAmount as any;
      const { adjustmentAmount, ...rest } = patch as any;
      Object.assign(st, rest);
      return this.statements.save(st);
    }

    Object.assign(st, patch);
    return this.statements.save(st);
  }

  async pay(id: string, userId: string, amount: string, paidAt?: string) {
    const st = await this.findById(id, userId);
    st.paidAmount = amount;
    st.paidAt = paidAt ? new Date(`${paidAt}T00:00:00Z`) : new Date();
    return this.statements.save(st);
  }

  async list(
    userId: string,
    opts: { creditCardId: string; year?: number; month?: number },
  ) {
    const card = await this.cards.findOne({
      where: { id: opts.creditCardId, createdByUserId: userId },
    });
    if (!card) throw new ForbiddenException();

    if (opts.year && opts.month) {
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

    return this.statements.find({
      where: { creditCardId: opts.creditCardId },
      order: { year: 'DESC', month: 'DESC' },
    });
  }
}
