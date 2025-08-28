/** TenantsService
 * Clean-architecture application service.
 * Exposes use-cases and enforces business rules.
 */
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Repository, ILike } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { Tenant } from "../../infrastructure/persistence/typeorm/entities/tenant.entity";
import { Purchase } from "../../infrastructure/persistence/typeorm/entities/purchase.entity";

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Purchase) private readonly purchases: Repository<Purchase>
  ) {}

  async create(name: string, userId: string) {
    const tenant = this.tenants.create({ name, createdByUserId: userId });
    return this.tenants.save(tenant);
  }

  async list(userId: string, search?: string) {
    return this.tenants.find({
      where: {
        createdByUserId: userId,
        ...(search ? { name: ILike(`%${search}%`) } : {}),
      },
      order: { name: "ASC" },
    });
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
    const count = await this.purchases.count({ where: { tenantId: id } });
    if (count > 0) throw new ForbiddenException("Tenant has purchases");
    await this.tenants.delete(id);
  }
}
