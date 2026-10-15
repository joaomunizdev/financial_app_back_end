/** CategoriesService
 * Clean-architecture application service.
 * Exposes use-cases and enforces business rules.
 */
import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Repository } from "typeorm";
import { Category } from "../../infrastructure/persistence/typeorm/entities/category.entity";

const DEFAULT_ICON = "mdi-tag-outline";

export type CategoryView = { id: string; name: string; icon: string; isDefault: boolean };

function toView(c: Category): CategoryView {
  return { id: c.id, name: c.name, icon: c.icon, isDefault: c.createdByUserId === null };
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>
  ) {}

  /** Default categories plus the user's own, by name. */
  async list(userId: string) {
    const rows = await this.categories
      .createQueryBuilder("c")
      .where("c.createdByUserId IS NULL OR c.createdByUserId = :userId", { userId })
      .orderBy("lower(c.name)", "ASC")
      .getMany();
    return rows.map(toView);
  }

  async create(userId: string, input: { name: string; icon?: string }) {
    const name = input.name.trim();
    await this.assertNameFree(userId, name);
    const saved = await this.categories.save(
      this.categories.create({ name, icon: input.icon ?? DEFAULT_ICON, createdByUserId: userId })
    );
    return toView(saved);
  }

  async update(id: string, userId: string, input: { name?: string; icon?: string }) {
    const c = await this.findOwned(id, userId);
    if (input.name !== undefined) {
      const name = input.name.trim();
      await this.assertNameFree(userId, name, id);
      c.name = name;
    }
    if (input.icon !== undefined) c.icon = input.icon;
    return toView(await this.categories.save(c));
  }

  /** Purchases, subscriptions and statement items of the category become uncategorized. */
  async remove(id: string, userId: string) {
    await this.findOwned(id, userId);
    await this.categories.delete(id);
  }

  /** A record may use a default category or one of the user's own. */
  async assertUsable(categoryId: string | null | undefined, userId: string) {
    if (!categoryId) return;
    const c = await this.categories.findOne({ where: { id: categoryId } });
    if (!c || (c.createdByUserId !== null && c.createdByUserId !== userId)) {
      throw new ForbiddenException("Category not found or not owned by user");
    }
  }

  private async findOwned(id: string, userId: string) {
    const c = await this.categories.findOne({ where: { id } });
    if (!c) throw new NotFoundException();
    if (c.createdByUserId === null) {
      throw new ForbiddenException("Default categories cannot be changed");
    }
    if (c.createdByUserId !== userId) throw new ForbiddenException();
    return c;
  }

  /** Names are unique per account, ignoring case, and can't repeat a default. */
  private async assertNameFree(userId: string, name: string, exceptId?: string) {
    const qb = this.categories
      .createQueryBuilder("c")
      .where("lower(c.name) = lower(:name)", { name })
      .andWhere(
        new Brackets((w) =>
          w.where("c.createdByUserId IS NULL").orWhere("c.createdByUserId = :userId", { userId })
        )
      );
    if (exceptId) qb.andWhere("c.id <> :exceptId", { exceptId });
    if (await qb.getCount()) throw new ConflictException("Category name already in use");
  }
}
