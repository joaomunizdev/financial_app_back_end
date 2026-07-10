/** PurchasesService
 * Clean-architecture application service.
 * Exposes use-cases and enforces business rules.
 */
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { Purchase } from "../../infrastructure/persistence/typeorm/entities/purchase.entity";
import { CreditCard } from "../../infrastructure/persistence/typeorm/entities/credit-card.entity";

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase) private readonly purchases: Repository<Purchase>,
    @InjectRepository(CreditCard) private readonly cards: Repository<CreditCard>
  ) {}

  private validateInstallments(p: Partial<Purchase>) {
    if (p.isInstallment === false) {
      p.installmentsTotal = null;
      p.installmentsPaid = 0;
    }
    if (p.isInstallment === true) {
      const total = Number(p.installmentsTotal ?? 0);
      const paid = Number(p.installmentsPaid ?? 0);
      if (total < 1)
        throw new BadRequestException("installmentsTotal must be >= 1");
      if (paid < 0 || paid > total) {
        throw new BadRequestException(
          "installmentsPaid must be between 0 and installmentsTotal"
        );
      }
    }
  }

  async create(input: Partial<Purchase>, userId: string) {
    if (!input.totalAmount || Number(input.totalAmount) <= 0) {
      throw new BadRequestException("totalAmount must be > 0");
    }
    const card = await this.cards.findOne({
      where: { id: input.creditCardId, createdByUserId: userId, active: true },
    });
    if (!card) throw new ForbiddenException("Credit card not found or inactive");
    input.createdByUserId = userId;
    this.validateInstallments(input);
    const p = this.purchases.create(input);
    return this.purchases.save(p);
  }

  async list(params: {
    userId: string;
    creditCardId?: string;
    tenantId?: string;
    dateStart?: string;
    dateEnd?: string;
    isInstallment?: boolean;
  }) {
    const qb = this.purchases
      .createQueryBuilder("purchase")
      .innerJoinAndSelect("purchase.creditCard", "card")
      .where("purchase.createdByUserId = :userId", { userId: params.userId })
      .andWhere("card.active = true");

    if (params.creditCardId) {
      qb.andWhere("purchase.creditCardId = :creditCardId", {
        creditCardId: params.creditCardId,
      });
    }
    if (params.tenantId) {
      qb.andWhere("purchase.tenantId = :tenantId", { tenantId: params.tenantId });
    }
    if (params.isInstallment !== undefined) {
      qb.andWhere("purchase.isInstallment = :isInstallment", {
        isInstallment: params.isInstallment,
      });
    }
    if (params.dateStart && params.dateEnd) {
      qb.andWhere("purchase.purchaseDate BETWEEN :dateStart AND :dateEnd", {
        dateStart: params.dateStart,
        dateEnd: params.dateEnd,
      });
    }

    return qb
      .orderBy("purchase.purchaseDate", "DESC")
      .addOrderBy("purchase.createdAt", "DESC")
      .getMany();
  }

  async update(id: string, patch: Partial<Purchase>, userId: string) {
    const p = await this.purchases.findOne({ where: { id } });
    if (!p) throw new NotFoundException();
    if (p.createdByUserId !== userId) throw new ForbiddenException();
    if (patch.creditCardId) {
      const card = await this.cards.findOne({
        where: { id: patch.creditCardId, createdByUserId: userId, active: true },
      });
      if (!card) throw new ForbiddenException("Credit card not found or inactive");
    }

    const merged: Partial<Purchase> = { ...p, ...patch };
    if (merged.totalAmount && Number(merged.totalAmount) <= 0) {
      throw new BadRequestException("totalAmount must be > 0");
    }
    if (merged.isInstallment !== undefined) {
      this.validateInstallments(merged);
    }
    Object.assign(p, merged);
    return this.purchases.save(p);
  }

  async setInstallmentsPaid(
    id: string,
    installmentsPaid: number,
    userId: string
  ) {
    const p = await this.purchases.findOne({ where: { id } });
    if (!p) throw new NotFoundException();
    if (p.createdByUserId !== userId) throw new ForbiddenException();
    const card = await this.cards.findOne({ where: { id: p.creditCardId, active: true } });
    if (!card) throw new NotFoundException();
    if (!p.isInstallment || p.installmentsTotal === null) {
      throw new BadRequestException("Purchase is not installment");
    }
    if (installmentsPaid < 0 || installmentsPaid > p.installmentsTotal) {
      throw new BadRequestException("installmentsPaid out of bounds");
    }
    p.installmentsPaid = installmentsPaid;
    return this.purchases.save(p);
  }

  async remove(id: string, userId: string) {
    const p = await this.purchases.findOne({ where: { id } });
    if (!p) throw new NotFoundException();
    if (p.createdByUserId !== userId) throw new ForbiddenException();
    await this.purchases.delete(id);
  }
}
