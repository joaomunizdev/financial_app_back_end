// src/application/services/statements.service.ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Statement } from "../../infrastructure/persistence/typeorm/entities/statement.entity";
import { StatementItem } from "../../infrastructure/persistence/typeorm/entities/statement-item.entity";
import { Purchase } from "../../infrastructure/persistence/typeorm/entities/purchase.entity";
import { CreditCard } from "../../infrastructure/persistence/typeorm/entities/credit-card.entity";

function monthDiff(a: string, b: string) {
  // a, b = YYYY-MM-01
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

function yyyymmdd(y: number, m: number) {
  const mm = String(m).padStart(2, "0");
  return `${y}-${mm}-01`;
}

@Injectable()
export class StatementsService {
  constructor(
    @InjectRepository(Statement)
    private readonly statements: Repository<Statement>,
    @InjectRepository(StatementItem)
    private readonly items: Repository<StatementItem>,
    @InjectRepository(Purchase)
    private readonly purchases: Repository<Purchase>,
    @InjectRepository(CreditCard) private readonly cards: Repository<CreditCard>
  ) {}

  async generate(params: {
    creditCardId: string;
    userId: string;
    year: number;
    month: number;
    closingDate?: string;
    dueDate?: string;
    locked?: boolean;
  }) {
    const card = await this.cards.findOne({
      where: { id: params.creditCardId, createdByUserId: params.userId },
    });
    if (!card)
      throw new ForbiddenException(
        "Credit card not found or not owned by user"
      );

    const exists = await this.statements.findOne({
      where: {
        creditCardId: params.creditCardId,
        year: params.year,
        month: params.month,
      },
    });
    if (exists) throw new ConflictException("Statement already exists");

    // cria a statement vazia
    const st = this.statements.create({
      creditCardId: params.creditCardId,
      year: params.year,
      month: params.month,
      closingDate: params.closingDate ?? null,
      dueDate: params.dueDate ?? null,
      locked: params.locked ?? false,
      adjustmentAmount: "0.00",
      totalAmount: "0.00",
    });
    await this.statements.save(st);

    // monta items
    const firstDay = yyyymmdd(params.year, params.month);
    const targetYm = firstDay.slice(0, 7); // YYYY-MM

    // Consideramos todas as purchases do usuário para o cartão, mas filtraremos pela lógica
    const all = await this.purchases.find({
      where: {
        creditCardId: params.creditCardId,
        createdByUserId: params.userId,
      },
      order: { purchaseDate: "ASC" },
    });

    const newItems: StatementItem[] = [];
    for (const p of all) {
      if (!p.isInstallment) {
        // entra se o mês/ano coincidir
        if (p.purchaseDate.slice(0, 7) === targetYm) {
          newItems.push(
            this.items.create({
              statementId: st.id,
              purchaseId: p.id,
              label: `Compra à vista`,
              amount: p.totalAmount,
            })
          );
        }
      } else {
        const total = Number(p.totalAmount);
        const parts = p.installmentsTotal ?? 0;
        if (parts < 1) continue;

        const per = Math.round((total / parts) * 100) / 100; // 2 casas
        // ajuste da última parcela
        const last = Math.round((total - per * (parts - 1)) * 100) / 100;

        const base = `${p.purchaseDate.slice(0, 4)}-${p.purchaseDate.slice(
          5,
          7
        )}-01`;
        const diff = monthDiff(base, firstDay);
        if (diff < 0 || diff >= parts) continue; // fora da janela da fatura

        const amount = diff === parts - 1 ? last : per;
        newItems.push(
          this.items.create({
            statementId: st.id,
            purchaseId: p.id,
            label: `Parcela ${diff + 1}/${parts}`,
            amount: amount.toFixed(2),
          })
        );
      }
    }

    if (newItems.length) {
      await this.items.save(newItems);
    }

    // total = soma(items) + adjustment
    const sum = newItems.reduce((acc, it) => acc + Number(it.amount), 0);
    st.totalAmount = (sum + Number(st.adjustmentAmount)).toFixed(2);
    await this.statements.save(st);

    return this.findById(st.id, params.userId);
  }

  async listByCard(userId: string, creditCardId: string) {
    const card = await this.cards.findOne({
      where: { id: creditCardId, createdByUserId: userId },
    });
    if (!card) throw new ForbiddenException();
    return this.statements.find({
      where: { creditCardId },
      order: { year: "DESC", month: "DESC" },
    });
  }

  async findById(id: string, userId: string) {
    const st = await this.statements.findOne({
      where: { id },
      relations: { items: true, creditCard: true },
    });
    if (!st) throw new NotFoundException();
    if (st.creditCard.createdByUserId !== userId)
      throw new ForbiddenException();
    return st;
  }

  async update(id: string, userId: string, patch: Partial<Statement>) {
    const st = await this.findById(id, userId);
    if (
      st.locked &&
      (patch.closingDate !== undefined ||
        patch.dueDate !== undefined ||
        patch.adjustmentAmount !== undefined)
    ) {
      // ainda permitimos ajustar datas/ajuste; se quiser bloquear tudo, troque a regra
    }
    Object.assign(st, patch);
    // recomputa total se adjustmentAmount mudou
    if (patch.adjustmentAmount !== undefined) {
      const items = await this.items.find({ where: { statementId: id } });
      const sum = items.reduce((acc, it) => acc + Number(it.amount), 0);
      st.totalAmount = (sum + Number(st.adjustmentAmount)).toFixed(2);
    }
    return this.statements.save(st);
  }

  async pay(id: string, userId: string, amount: string, paidAt?: string) {
    const st = await this.findById(id, userId);
    st.paidAmount = amount;
    st.paidAt = paidAt ? new Date(`${paidAt}T00:00:00Z`) : new Date();
    return this.statements.save(st);
  }
}
