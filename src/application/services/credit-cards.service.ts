/** CreditCardsService
 * Clean-architecture application service.
 * Exposes use-cases and enforces business rules.
 */
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Repository } from "typeorm";
import { CreditCard } from "../../infrastructure/persistence/typeorm/entities/credit-card.entity";
import { InjectRepository } from "@nestjs/typeorm";

@Injectable()
export class CreditCardsService {
  constructor(
    @InjectRepository(CreditCard) private readonly cards: Repository<CreditCard>
  ) {}

  async create(data: Partial<CreditCard>, userId: string) {
    const card = this.cards.create({ ...data, createdByUserId: userId });
    return this.cards.save(card);
  }

  async list(userId: string) {
    return this.cards.find({
      where: { createdByUserId: userId },
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
    await this.cards.delete(id);
  }
}
