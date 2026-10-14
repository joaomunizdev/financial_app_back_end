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
import { DataSource, Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { Purchase } from "../../infrastructure/persistence/typeorm/entities/purchase.entity";
import { CreditCard } from "../../infrastructure/persistence/typeorm/entities/credit-card.entity";
import { Tenant } from "../../infrastructure/persistence/typeorm/entities/tenant.entity";
import { StatementsService } from "./statements.service";

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase) private readonly purchases: Repository<Purchase>,
    @InjectRepository(CreditCard) private readonly cards: Repository<CreditCard>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly statements: StatementsService,
    private readonly dataSource: DataSource
  ) {}

  private async assertTenantOwned(tenantId: string | undefined, userId: string) {
    if (!tenantId) return;
    const tenant = await this.tenants.findOne({
      where: { id: tenantId, createdByUserId: userId },
    });
    if (!tenant) throw new ForbiddenException("Tenant not found or not owned by user");
  }

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
    await this.assertTenantOwned(input.tenantId, userId);
    input.createdByUserId = userId;
    this.validateInstallments(input);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Purchase);
      const p = await repo.save(repo.create(input));
      await this.statements.rebuildOpenStatements(manager, [p.creditCardId], userId);
      return p;
    });
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
    await this.assertTenantOwned(patch.tenantId, userId);

    const merged: Partial<Purchase> = { ...p, ...patch };
    if (merged.totalAmount && Number(merged.totalAmount) <= 0) {
      throw new BadRequestException("totalAmount must be > 0");
    }
    if (merged.isInstallment !== undefined) {
      this.validateInstallments(merged);
    }

    return this.dataSource.transaction(async (manager) => {
      await this.statements.assertPurchaseEditable(manager, p.id);
      const previousCardId = p.creditCardId;
      Object.assign(p, merged);
      const saved = await manager.getRepository(Purchase).save(p);
      await this.statements.rebuildOpenStatements(
        manager,
        [previousCardId, saved.creditCardId],
        userId
      );
      return saved;
    });
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

    await this.dataSource.transaction(async (manager) => {
      await this.statements.assertPurchaseEditable(manager, p.id);
      await manager.getRepository(Purchase).delete(id);
      await this.statements.rebuildOpenStatements(manager, [p.creditCardId], userId);
    });
  }
}
