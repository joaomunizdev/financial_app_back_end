/** ReportsService
 * Clean-architecture application service.
 * Exposes use-cases and enforces business rules.
 */
import { Injectable } from "@nestjs/common";
import { Repository, SelectQueryBuilder } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { Purchase } from "../../infrastructure/persistence/typeorm/entities/purchase.entity";
import { Tenant } from "../../infrastructure/persistence/typeorm/entities/tenant.entity";

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Purchase)
    private readonly purchases: Repository<Purchase>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>
  ) {}

  private baseQB(userId: string): SelectQueryBuilder<Purchase> {
    return this.purchases
      .createQueryBuilder("p")
      .where("p.created_by_user_id = :userId", { userId });
  }

  async summaryByTenant(filters: {
    userId: string;
    creditCardId?: string;
    dateStart?: string;
    dateEnd?: string;
    isInstallment?: boolean;
  }) {
    let qb = this.baseQB(filters.userId)
      .select("p.tenant_id", "tenantId")
      .addSelect("t.name", "tenantName")
      .addSelect("SUM(p.total_amount)::text", "total_amount")
      .innerJoin(Tenant, "t", "t.id = p.tenant_id")
      .groupBy("p.tenant_id, t.name")
      .orderBy("total_amount", "DESC");

    if (filters.creditCardId)
      qb = qb.andWhere("p.credit_card_id = :cc", { cc: filters.creditCardId });
    if (filters.isInstallment !== undefined)
      qb = qb.andWhere("p.is_installment = :inst", {
        inst: filters.isInstallment,
      });
    if (filters.dateStart && filters.dateEnd)
      qb = qb.andWhere("p.purchase_date BETWEEN :ds AND :de", {
        ds: filters.dateStart,
        de: filters.dateEnd,
      });

    return qb.getRawMany();
  }

  async globalSummary(filters: {
    userId: string;
    creditCardId?: string;
    dateStart?: string;
    dateEnd?: string;
    isInstallment?: boolean;
  }) {
    let qb = this.baseQB(filters.userId).select(
      "COALESCE(SUM(p.total_amount),0)::text",
      "total_amount"
    );

    if (filters.creditCardId)
      qb = qb.andWhere("p.credit_card_id = :cc", { cc: filters.creditCardId });
    if (filters.isInstallment !== undefined)
      qb = qb.andWhere("p.is_installment = :inst", {
        inst: filters.isInstallment,
      });
    if (filters.dateStart && filters.dateEnd)
      qb = qb.andWhere("p.purchase_date BETWEEN :ds AND :de", {
        ds: filters.dateStart,
        de: filters.dateEnd,
      });

    return qb.getRawOne();
  }
}
