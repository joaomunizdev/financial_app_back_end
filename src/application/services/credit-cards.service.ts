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
import { Repository } from "typeorm";
import { CreditCard } from "../../infrastructure/persistence/typeorm/entities/credit-card.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Purchase } from "../../infrastructure/persistence/typeorm/entities/purchase.entity";
import { Statement } from "../../infrastructure/persistence/typeorm/entities/statement.entity";

@Injectable()
export class CreditCardsService {
  constructor(
    @InjectRepository(CreditCard) private readonly cards: Repository<CreditCard>,
    @InjectRepository(Purchase) private readonly purchases: Repository<Purchase>,
    @InjectRepository(Statement) private readonly statements: Repository<Statement>
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
    Object.assign(c, patch);
    return this.cards.save(c);
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
