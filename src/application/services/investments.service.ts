/** InvestmentsService
 * Clean-architecture application service.
 * Exposes use-cases and enforces business rules.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  INVESTMENT_TYPES,
  Investment,
  InvestmentMovement,
  InvestmentType,
  MovementKind,
} from "../../infrastructure/persistence/typeorm/entities/investment.entity";
import { fromCents, toCents } from "../utils/money";
import { PageRequest, paginate } from "../utils/pagination";
import {
  lastMonths,
  monthEnd,
  netInvestedCents,
  valueAtCents,
} from "../utils/investments";
import { todayInReportTimeZone } from "../utils/dates";

type InvestmentInput = { name?: string; type?: InvestmentType; institution?: string | null };

@Injectable()
export class InvestmentsService {
  constructor(
    @InjectRepository(Investment) private readonly investments: Repository<Investment>,
    @InjectRepository(InvestmentMovement)
    private readonly movements: Repository<InvestmentMovement>
  ) {}

  /** Investments with their current value and net amount invested (computed). */
  async list(
    userId: string,
    filters: { search?: string; type?: InvestmentType } = {},
    page?: PageRequest
  ) {
    const qb = this.investments
      .createQueryBuilder("inv")
      .where("inv.createdByUserId = :userId", { userId });
    if (filters.search) {
      qb.andWhere("(inv.name ILIKE :s OR inv.institution ILIKE :s)", { s: `%${filters.search}%` });
    }
    if (filters.type) qb.andWhere("inv.type = :type", { type: filters.type });
    const result = await paginate(
      qb,
      page,
      { name: "inv.name", type: "inv.type", institution: "inv.institution" },
      [["inv.name", "ASC"]]
    );
    const rows = Array.isArray(result) ? result : result.items;
    const withValues = await this.withValues(rows);
    return Array.isArray(result) ? withValues : { ...result, items: withValues };
  }

  async create(userId: string, input: InvestmentInput) {
    const saved = await this.investments.save(
      this.investments.create({
        name: input.name!.trim(),
        type: input.type!,
        institution: input.institution?.trim() || null,
        createdByUserId: userId,
      })
    );
    return (await this.withValues([saved]))[0];
  }

  async update(id: string, userId: string, input: InvestmentInput) {
    const inv = await this.findOwned(id, userId);
    if (input.name !== undefined) inv.name = input.name.trim();
    if (input.type !== undefined) inv.type = input.type;
    if (input.institution !== undefined) inv.institution = input.institution?.trim() || null;
    return (await this.withValues([await this.investments.save(inv)]))[0];
  }

  /** Deletes the investment and its movements. */
  async remove(id: string, userId: string) {
    await this.findOwned(id, userId);
    await this.investments.delete(id);
  }

  /** Movements of one investment, newest first. */
  async listMovements(id: string, userId: string) {
    await this.findOwned(id, userId);
    return this.movements.find({
      where: { investmentId: id },
      order: { date: "DESC", createdAt: "DESC" },
    });
  }

  async addMovement(
    id: string,
    userId: string,
    input: { kind: MovementKind; amount: string; date: string }
  ) {
    await this.findOwned(id, userId);
    const cents = toCents(input.amount);
    const date = input.date.slice(0, 10);
    if (input.kind !== "balance" && cents <= 0) {
      throw new BadRequestException("amount must be > 0");
    }
    if (cents < 0) throw new BadRequestException("amount must be >= 0");
    if (input.kind === "withdrawal") {
      const current = await this.movements.find({ where: { investmentId: id } });
      if (cents > valueAtCents(current, date)) {
        throw new BadRequestException("Withdrawal exceeds the investment value on that date");
      }
    }
    return this.movements.save(
      this.movements.create({ investmentId: id, kind: input.kind, amount: fromCents(cents), date })
    );
  }

  async removeMovement(id: string, movementId: string, userId: string) {
    await this.findOwned(id, userId);
    const mv = await this.movements.findOne({ where: { id: movementId, investmentId: id } });
    if (!mv) throw new NotFoundException();
    await this.movements.delete(movementId);
  }

  /**
   * Dashboard summary for a month: total value at the month's end, contributions
   * and withdrawals dated in the month, the value at the end of each of the
   * `months` months up to it, and the value per investment type.
   */
  async summary(userId: string, year: number, month: number, months = 6) {
    const invs = await this.investments.find({ where: { createdByUserId: userId } });
    const all = invs.length
      ? await this.movements.find({ where: { investmentId: In(invs.map((i) => i.id)) } })
      : [];
    const byInvestment = new Map<string, InvestmentMovement[]>();
    for (const m of all) {
      byInvestment.set(m.investmentId, [...(byInvestment.get(m.investmentId) ?? []), m]);
    }
    const end = monthEnd(year, month);
    const prefix = end.slice(0, 7);
    const totalAt = (date: string) =>
      invs.reduce((sum, i) => sum + valueAtCents(byInvestment.get(i.id) ?? [], date), 0);
    const inMonth = (kind: MovementKind) =>
      all
        .filter((m) => m.kind === kind && String(m.date).slice(0, 7) === prefix)
        .reduce((sum, m) => sum + toCents(m.amount), 0);

    const typeCents = new Map<InvestmentType, number>();
    for (const i of invs) {
      const v = valueAtCents(byInvestment.get(i.id) ?? [], end);
      typeCents.set(i.type, (typeCents.get(i.type) ?? 0) + v);
    }

    return {
      totalValue: fromCents(totalAt(end)),
      contributions: fromCents(inMonth("contribution")),
      withdrawals: fromCents(inMonth("withdrawal")),
      investmentsCount: invs.length,
      history: lastMonths(year, month, months).map((p) => ({
        ...p,
        value: fromCents(totalAt(monthEnd(p.year, p.month))),
      })),
      // Fixed type order (identity colors in the UI follow the type, not the rank).
      byType: INVESTMENT_TYPES.filter((t) => (typeCents.get(t) ?? 0) > 0).map((type) => ({
        type,
        value: fromCents(typeCents.get(type)!),
      })),
    };
  }

  private async findOwned(id: string, userId: string) {
    const inv = await this.investments.findOne({ where: { id } });
    if (!inv) throw new NotFoundException();
    if (inv.createdByUserId !== userId) throw new ForbiddenException();
    return inv;
  }

  /** Adds currentValue (today) and investedTotal (contributions − withdrawals). */
  private async withValues(rows: Investment[]) {
    if (!rows.length) return [];
    const all = await this.movements.find({ where: { investmentId: In(rows.map((r) => r.id)) } });
    const today = todayInReportTimeZone();
    return rows.map((inv) => {
      const mv = all.filter((m) => m.investmentId === inv.id);
      const last = mv.reduce<string | null>(
        (acc, m) => (!acc || String(m.date) > acc ? String(m.date).slice(0, 10) : acc),
        null
      );
      return {
        id: inv.id,
        name: inv.name,
        type: inv.type,
        institution: inv.institution,
        currentValue: fromCents(valueAtCents(mv, today)),
        investedTotal: fromCents(netInvestedCents(mv)),
        lastMovementDate: last,
      };
    });
  }
}
