/** CreditCardsService
 * Clean-architecture application service.
 * Exposes use-cases and enforces business rules.
 */
import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  CreditCard,
  CreditCardType,
} from "../../infrastructure/persistence/typeorm/entities/credit-card.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Purchase } from "../../infrastructure/persistence/typeorm/entities/purchase.entity";
import { Statement } from "../../infrastructure/persistence/typeorm/entities/statement.entity";
import { StatementItem } from "../../infrastructure/persistence/typeorm/entities/statement-item.entity";
import { StatementsService } from "./statements.service";
import { fromCents, installmentAmountCents, toCents } from "../utils/money";
import { addMonths } from "../utils/dates";

const DESCRIPTION_MAX = 255;

@Injectable()
export class CreditCardsService {
  constructor(
    @InjectRepository(CreditCard) private readonly cards: Repository<CreditCard>,
    @InjectRepository(Purchase) private readonly purchases: Repository<Purchase>,
    @InjectRepository(Statement) private readonly statements: Repository<Statement>,
    private readonly statementsService: StatementsService,
    private readonly dataSource: DataSource
  ) {}

  async create(data: Partial<CreditCard>, userId: string) {
    const card = this.cards.create({
      ...data,
      active: true,
      createdByUserId: userId,
    });
    return this.cards.save(card);
  }

  async list(userId: string) {
    return this.cards.find({
      where: { createdByUserId: userId, active: true },
      order: { nickname: "ASC" },
    });
  }

  async update(id: string, patch: Partial<CreditCard>, userId: string) {
    const c = await this.cards.findOne({ where: { id } });
    if (!c) throw new NotFoundException();
    if (c.createdByUserId !== userId) throw new ForbiddenException();

    const becomesDebit =
      patch.cardType === CreditCardType.DEBIT && c.cardType !== CreditCardType.DEBIT;
    if (!becomesDebit) {
      Object.assign(c, patch);
      return this.cards.save(c);
    }

    return this.dataSource.transaction(async (manager) => {
      Object.assign(c, patch);
      const saved = await manager.getRepository(CreditCard).save(c);
      await this.convertInstallmentsToMonthly(manager, c.id, userId);
      await this.statementsService.rebuildOpenStatements(manager, [c.id], userId);
      return saved;
    });
  }

  /**
   * Debit cards don't take installments, so each installment purchase of the card
   * becomes one one-time purchase per installment, dated in that installment's month
   * and with the same amount statements already use (installmentAmountCents).
   * Statement items are re-pointed to the new purchase of their installment, so
   * locked/paid statements keep their amounts (and their "Parcela k/n" labels as
   * history); open statements are rebuilt by the caller.
   */
  private async convertInstallmentsToMonthly(
    manager: EntityManager,
    cardId: string,
    userId: string
  ) {
    const purchaseRepo = manager.getRepository(Purchase);
    const itemRepo = manager.getRepository(StatementItem);
    const installments = await purchaseRepo.find({
      where: { creditCardId: cardId, createdByUserId: userId, isInstallment: true },
      order: { purchaseDate: "ASC" },
      lock: { mode: "pessimistic_write" },
    });

    for (const p of installments) {
      const parts = Math.max(1, p.installmentsTotal ?? 1);
      const totalCents = toCents(p.totalAmount);
      for (let k = 1; k <= parts; k++) {
        const suffix = ` (${k}/${parts})`;
        const monthly = await purchaseRepo.save(
          purchaseRepo.create({
            creditCardId: p.creditCardId,
            tenantId: p.tenantId,
            createdByUserId: p.createdByUserId,
            description:
              p.description.trim().slice(0, DESCRIPTION_MAX - suffix.length) + suffix,
            purchaseDate: addMonths(p.purchaseDate, k - 1),
            totalAmount: fromCents(installmentAmountCents(totalCents, parts, k)),
            isInstallment: false,
            installmentsTotal: null,
            installmentsPaid: 0,
          })
        );
        await itemRepo.update(
          { purchaseId: p.id, installmentNumber: k },
          { purchaseId: monthly.id, installmentNumber: null }
        );
      }

      // Deleting the purchase cascades its items; never lose statement history.
      const unmatched = await itemRepo.count({ where: { purchaseId: p.id } });
      if (unmatched > 0) {
        throw new ConflictException(
          `Purchase "${p.description}" has statement items without an installment number; the card was not changed`
        );
      }
      await purchaseRepo.delete(p.id);
    }
  }

  async remove(id: string, userId: string) {
    const c = await this.cards.findOne({ where: { id } });
    if (!c) throw new NotFoundException();
    if (c.createdByUserId !== userId) throw new ForbiddenException();
    // Deleting would cascade statements (financial history); deactivate instead.
    const [purchases, statements] = await Promise.all([
      this.purchases.count({ where: { creditCardId: id } }),
      this.statements.count({ where: { creditCardId: id } }),
    ]);
    if (purchases > 0 || statements > 0) {
      throw new ConflictException(
        "Credit card has purchases or statements; deactivate it instead"
      );
    }
    await this.cards.delete(id);
  }
}
