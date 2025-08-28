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
  ) {}

  async totalsByTenant(userId: string, opts?: { statementId?: string }) {
    if (opts?.statementId) {
      const st = await this.statements.findOne({
        where: { id: opts.statementId },
        relations: { creditCard: true },
      });
      if (!st) throw new NotFoundException('Statement not found');
      if (st.creditCard.createdByUserId !== userId)
        throw new ForbiddenException();

      const rows = await this.items
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
        .getRawMany();

      return rows.map((r) => ({
        tenantId: r.tenantid ?? r.tenantId,
        tenantName: r.tenantname ?? r.tenantName,
        totalAmount: r.totalamount ?? r.totalAmount,
      }));
    }

    const rows = await this.purchases
      .createQueryBuilder('p')
      .innerJoin('p.tenant', 't')
      .where('p.createdByUserId = :uid', { uid: userId })
      .select('t.id', 'tenantId')
      .addSelect('t.name', 'tenantName')
      .addSelect(
        `
        SUM(
          CASE 
            WHEN p.isInstallment = true AND p.installmentsTotal > 0
            THEN (CAST(p.totalAmount AS numeric))
            ELSE CAST(p.totalAmount AS numeric)
          END
        )
      `,
        'totalAmount',
      )
      .groupBy('t.id')
      .addGroupBy('t.name')
      .orderBy('t.name', 'ASC')
      .getRawMany();

    return rows.map((r) => ({
      tenantId: r.tenantid ?? r.tenantId,
      tenantName: r.tenantname ?? r.tenantName,
      totalAmount: r.totalamount ?? r.totalAmount,
    }));
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

    const sum = await this.purchases
      .createQueryBuilder('p')
      .where('p.createdByUserId = :uid', { uid: userId })
      .select('COALESCE(SUM(CAST(p.totalAmount AS numeric)),0)', 'sum')
      .getRawOne<{ sum: string }>();

    return { totalAmount: sum || '0.00' };
  }
}
