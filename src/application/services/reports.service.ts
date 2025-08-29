/** ReportsService.
 * Clean-architecture application service.
 * Exposes use-cases and enforces business rules.
 */
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Purchase } from '../../infrastructure/persistence/typeorm/entities/purchase.entity';
import { Tenant } from '../../infrastructure/persistence/typeorm/entities/tenant.entity';
import { Statement } from '../../infrastructure/persistence/typeorm/entities/statement.entity';
import { StatementItem } from '../../infrastructure/persistence/typeorm/entities/statement-item.entity';
import { CreditCard } from '../../infrastructure/persistence/typeorm/entities/credit-card.entity';
import { Subscription } from 'src/infrastructure/persistence/typeorm/entities/subscription.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Purchase)
    private readonly purchases: Repository<Purchase>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Statement)
    private readonly statements: Repository<Statement>,
    @InjectRepository(StatementItem)
    private readonly items: Repository<StatementItem>,
    @InjectRepository(CreditCard)
    private readonly cards: Repository<CreditCard>,
    @InjectRepository(Subscription)
    private readonly subs: Repository<Subscription>,
  ) {}

  async totalsByTenant(userId: string, opts?: { statementId?: string }) {
    const mergeByTenant = (
      ...rows: Array<
        Array<{
          tenantId: string | null;
          tenantName: string | null;
          totalAmount: string;
        }>
      >
    ) => {
      const acc = new Map<
        string,
        {
          tenantId: string | null;
          tenantName: string | null;
          totalAmount: number;
        }
      >();
      for (const arr of rows) {
        for (const r of arr) {
          const key = r.tenantId ?? '__null__';
          const prev = acc.get(key) ?? {
            tenantId: r.tenantId ?? null,
            tenantName: r.tenantName ?? '—',
            totalAmount: 0,
          };
          prev.totalAmount += Number(r.totalAmount || 0);
          if (r.tenantName) prev.tenantName = r.tenantName;
          acc.set(key, prev);
        }
      }
      return [...acc.values()]
        .sort((a, b) => (a.tenantName ?? '').localeCompare(b.tenantName ?? ''))
        .map((x) => ({
          tenantId: x.tenantId,
          tenantName: x.tenantName,
          totalAmount: x.totalAmount.toFixed(2),
        }));
    };

    if (opts?.statementId) {
      const st = await this.statements.findOne({
        where: { id: opts.statementId },
        relations: { creditCard: true },
      });
      if (!st) throw new NotFoundException('Statement not found');
      if (st.creditCard.createdByUserId !== userId)
        throw new ForbiddenException();

      const purchaseRows = await this.items
        .createQueryBuilder('si')
        .innerJoin('si.statement', 's')
        .innerJoin('si.purchase', 'p')
        .innerJoin('p.tenant', 't')
        .innerJoin('p.creditCard', 'cc')
        .where('s.id = :sid', { sid: opts.statementId })
        .andWhere('cc.createdByUserId = :uid', { uid: userId })
        .select('t.id', 'tenantId')
        .addSelect('t.name', 'tenantName')
        .addSelect('SUM(CAST(si.amount AS numeric))', 'totalAmount')
        .groupBy('t.id')
        .addGroupBy('t.name')
        .orderBy('t.name', 'ASC')
        .getRawMany<{
          tenantId: string;
          tenantName: string;
          totalAmount: string;
        }>();

      const subsRows = await this.subs
        .createQueryBuilder('sub')
        .leftJoin('sub.tenant', 't')
        .where('sub.creditCardId = :card', { card: st.creditCardId })
        .andWhere('sub.createdByUserId = :uid', { uid: userId })
        .andWhere('sub.active = true')
        .select('t.id', 'tenantId')
        .addSelect('t.name', 'tenantName')
        .addSelect(
          'COALESCE(SUM(CAST(sub.amount AS numeric)), 0)',
          'totalAmount',
        )
        .groupBy('t.id')
        .addGroupBy('t.name')
        .getRawMany<{
          tenantId: string | null;
          tenantName: string | null;
          totalAmount: string;
        }>();

      return mergeByTenant(purchaseRows, subsRows);
    }

    const purchaseRows = await this.purchases
      .createQueryBuilder('p')
      .innerJoin('p.tenant', 't')
      .where('p.createdByUserId = :uid', { uid: userId })
      .select('t.id', 'tenantId')
      .addSelect('t.name', 'tenantName')
      .addSelect(
        'COALESCE(SUM(CAST(p.totalAmount AS numeric)), 0)',
        'totalAmount',
      )
      .groupBy('t.id')
      .addGroupBy('t.name')
      .orderBy('t.name', 'ASC')
      .getRawMany<{
        tenantId: string;
        tenantName: string;
        totalAmount: string;
      }>();

    const subsRows = await this.subs
      .createQueryBuilder('sub')
      .leftJoin('sub.tenant', 't')
      .where('sub.createdByUserId = :uid', { uid: userId })
      .andWhere('sub.active = true')
      .select('t.id', 'tenantId')
      .addSelect('t.name', 'tenantName')
      .addSelect('COALESCE(SUM(CAST(sub.amount AS numeric)), 0)', 'totalAmount')
      .groupBy('t.id')
      .addGroupBy('t.name')
      .getRawMany<{
        tenantId: string | null;
        tenantName: string | null;
        totalAmount: string;
      }>();

    return mergeByTenant(purchaseRows, subsRows);
  }

  async totalGlobal(userId: string, opts?: { statementId?: string }) {
    if (opts?.statementId) {
      const st = await this.statements.findOne({
        where: { id: opts.statementId },
        relations: { creditCard: true },
      });
      if (!st) throw new NotFoundException('Statement not found');
      if (st.creditCard.createdByUserId !== userId)
        throw new ForbiddenException();
      return { totalAmount: st.totalAmount };
    }

    const p = await this.purchases
      .createQueryBuilder('p')
      .where('p.createdByUserId = :uid', { uid: userId })
      .select('COALESCE(SUM(CAST(p.totalAmount AS numeric)),0)', 'sum')
      .getRawOne<{ sum: string }>();

    const s = await this.subs
      .createQueryBuilder('sub')
      .where('sub.createdByUserId = :uid', { uid: userId })
      .andWhere('sub.active = true')
      .select('COALESCE(SUM(CAST(sub.amount AS numeric)),0)', 'sum')
      .getRawOne<{ sum: string }>();

    const total = Number(p?.sum || 0) + Number(s?.sum || 0);
    return { totalAmount: total.toFixed(2) };
  }
}
