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
import { Repository, Between } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { Purchase } from "../../infrastructure/persistence/typeorm/entities/purchase.entity";

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase) private readonly purchases: Repository<Purchase>
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
    const where: any = { createdByUserId: params.userId };
    if (params.creditCardId) where.creditCardId = params.creditCardId;
    if (params.tenantId) where.tenantId = params.tenantId;
    if (params.isInstallment !== undefined)
      where.isInstallment = params.isInstallment;
    if (params.dateStart && params.dateEnd) {
      where.purchaseDate = Between(params.dateStart, params.dateEnd);
    }
    return this.purchases.find({
      where,
      order: { purchaseDate: "DESC", createdAt: "DESC" },
    });
  }

  async update(id: string, patch: Partial<Purchase>, userId: string) {
    const p = await this.purchases.findOne({ where: { id } });
    if (!p) throw new NotFoundException();
    if (p.createdByUserId !== userId) throw new ForbiddenException();

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
