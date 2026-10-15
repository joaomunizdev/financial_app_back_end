/** TenantsService
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
import { InjectRepository } from "@nestjs/typeorm";
import { Tenant } from "../../infrastructure/persistence/typeorm/entities/tenant.entity";
import { Purchase } from "../../infrastructure/persistence/typeorm/entities/purchase.entity";
import { Subscription } from "../../infrastructure/persistence/typeorm/entities/subscription.entity";
import { FixedExpense } from "../../infrastructure/persistence/typeorm/entities/fixed-expense.entity";
import { IncomeSource } from "../../infrastructure/persistence/typeorm/entities/income-source.entity";
import { StatementItem } from "../../infrastructure/persistence/typeorm/entities/statement-item.entity";
import { PageRequest, paginate } from "../utils/pagination";

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Purchase) private readonly purchases: Repository<Purchase>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(FixedExpense) private readonly fixedExpenses: Repository<FixedExpense>,
    @InjectRepository(IncomeSource) private readonly incomeSources: Repository<IncomeSource>,
    @InjectRepository(StatementItem) private readonly items: Repository<StatementItem>
  ) {}

  async create(name: string, userId: string) {
    const tenant = this.tenants.create({ name, createdByUserId: userId });
    return this.tenants.save(tenant);
  }

  async list(userId: string, search?: string, page?: PageRequest) {
    const qb = this.tenants
      .createQueryBuilder("tenant")
      .where("tenant.createdByUserId = :userId", { userId });
    if (search) qb.andWhere("tenant.name ILIKE :search", { search: `%${search}%` });
    return paginate(qb, page, { name: "tenant.name" }, [["tenant.name", "ASC"]]);
  }

  async update(id: string, name: string, userId: string) {
    const t = await this.tenants.findOne({ where: { id } });
    if (!t) throw new NotFoundException();
    if (t.createdByUserId !== userId) throw new ForbiddenException();
    t.name = name;
    return this.tenants.save(t);
  }

  async remove(id: string, userId: string) {
    const t = await this.tenants.findOne({ where: { id } });
    if (!t) throw new NotFoundException();
    if (t.createdByUserId !== userId) throw new ForbiddenException();
    // Deleting would detach (SET NULL) or block on linked financial records.
    const counts = await Promise.all([
      this.purchases.count({ where: { tenantId: id } }),
      this.subs.count({ where: { tenantId: id } }),
      this.fixedExpenses.count({ where: { tenantId: id } }),
      this.incomeSources.count({ where: { tenantId: id } }),
      this.items.count({ where: { tenantId: id } }),
    ]);
    if (counts.some((c) => c > 0)) {
      throw new ConflictException("Tenant has linked financial records");
    }
    await this.tenants.delete(id);
  }
}
