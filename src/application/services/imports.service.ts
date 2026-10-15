/** ImportsService
 * Clean-architecture application service.
 * Reads bank statements / credit card invoices and imports the confirmed lines.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Purchase } from '../../infrastructure/persistence/typeorm/entities/purchase.entity';
import {
  IncomeSource,
  IncomeSourceType,
} from '../../infrastructure/persistence/typeorm/entities/income-source.entity';
import {
  CreditCard,
  CreditCardType,
} from '../../infrastructure/persistence/typeorm/entities/credit-card.entity';
import { Tenant } from '../../infrastructure/persistence/typeorm/entities/tenant.entity';
import { User } from '../../infrastructure/persistence/typeorm/entities/user.entity';
import { parseImportFile } from '../imports/detect';
import { BANK_NAMES, ImportFormatError, ImportKind } from '../imports/types';
import {
  descriptionSignature,
  importKeys,
  keywordCategory,
  ownNamePatterns,
  pairCardFundedPix,
  suggestAction,
} from '../imports/suggestions';
import { CategoriesService } from './categories.service';
import { StatementsService } from './statements.service';
import { fromCents, toCents } from '../utils/money';

export type ConfirmLine = {
  key: string;
  action: 'purchase' | 'income';
  date: string;
  description: string;
  /** Per installment when `installment` is set. */
  amount: string;
  installment?: { number: number; total: number } | null;
  tenantId: string;
  categoryId?: string | null;
  /** Bank statement purchases only. */
  paymentMethod?: 'pix' | 'cash';
};

const MAX_LINES = 1000;

@Injectable()
export class ImportsService {
  constructor(
    @InjectRepository(Purchase) private readonly purchases: Repository<Purchase>,
    @InjectRepository(IncomeSource) private readonly incomes: Repository<IncomeSource>,
    @InjectRepository(CreditCard) private readonly cards: Repository<CreditCard>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly categories: CategoriesService,
    private readonly statements: StatementsService,
    private readonly dataSource: DataSource,
  ) {}

  /** Parses the file and returns the lines with suggestions; nothing is saved. */
  async preview(userId: string, kind: ImportKind, file: Buffer, creditCardId?: string) {
    let parsed;
    try {
      parsed = await parseImportFile(file, kind);
    } catch (e) {
      if (e instanceof ImportFormatError) throw new UnprocessableEntityException(e.message);
      throw new UnprocessableEntityException('Unreadable file');
    }
    if (parsed.lines.length > MAX_LINES) {
      throw new UnprocessableEntityException(`Too many lines (max ${MAX_LINES})`);
    }
    if (creditCardId) await this.ownedCard(userId, creditCardId);

    const keys = importKeys(parsed.bank, kind, parsed.lines);
    const [importedPurchases, importedIncomes] = keys.length
      ? await Promise.all([
          this.purchases.find({ where: { createdByUserId: userId, importKey: In(keys) }, select: { importKey: true } }),
          this.incomes.find({ where: { createdByUserId: userId, importKey: In(keys) }, select: { importKey: true } }),
        ])
      : [[], []];
    const imported = new Set([...importedPurchases, ...importedIncomes].map((r) => r.importKey));

    const dates = parsed.lines.map((l) => l.date).sort();
    const range = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
    const possible = range ? await this.possibleDuplicates(userId, kind, range, creditCardId) : null;

    const user = await this.users.findOne({ where: { id: userId } });
    const ownNames = ownNamePatterns(user?.name ?? '');
    const categoryFor = await this.categorySuggester(userId);

    const suggestions = parsed.lines.map((line) => ({ line, ...suggestAction(kind, line, ownNames) }));
    if (kind === 'statement') pairCardFundedPix(suggestions);

    const lines = parsed.lines.map((l, i) => {
      const suggestion = suggestions[i];
      let duplicate: { type: 'imported' | 'possible'; description?: string } | null = null;
      if (imported.has(keys[i])) duplicate = { type: 'imported' };
      else if (suggestion.action !== 'ignore' && possible) {
        const match = possible(l.date, l.amountCents, l.direction, l.installment?.total ?? null);
        if (match) duplicate = { type: 'possible', description: match };
      }
      return {
        key: keys[i],
        date: l.date,
        description: l.description,
        amount: fromCents(l.amountCents),
        direction: l.direction,
        installment: l.installment,
        suggestedAction: duplicate ? 'ignore' : suggestion.action,
        reason: duplicate ? (duplicate.type === 'imported' ? 'already_imported' : 'possible_duplicate') : suggestion.reason,
        duplicateOf: duplicate?.description ?? null,
        categoryId: l.direction === 'debit' ? categoryFor(l.description) : null,
      };
    });

    const readTotalCents = parsed.lines
      .filter((l) => l.direction === 'debit')
      .reduce((sum, l) => sum + l.amountCents, 0);
    return {
      kind,
      bank: parsed.bank,
      bankName: BANK_NAMES[parsed.bank],
      format: parsed.format,
      period: range,
      expectedTotal: parsed.expectedTotalCents !== undefined ? fromCents(parsed.expectedTotalCents) : null,
      readTotal: fromCents(readTotalCents),
      warnings: parsed.warnings,
      lines,
    };
  }

  /** Creates the confirmed lines in one transaction; already imported keys are skipped. */
  async confirm(userId: string, input: { kind: ImportKind; creditCardId?: string; lines: ConfirmLine[] }) {
    if (input.lines.length > MAX_LINES) throw new BadRequestException(`Too many lines (max ${MAX_LINES})`);
    let card: CreditCard | null = null;
    if (input.kind === 'invoice') {
      if (!input.creditCardId) throw new BadRequestException('creditCardId is required for invoices');
      card = await this.ownedCard(userId, input.creditCardId);
    }
    for (const l of input.lines) {
      if (input.kind === 'invoice' && l.action === 'income') {
        throw new BadRequestException('Invoice lines can only be imported as purchases');
      }
      if (l.installment && (input.kind !== 'invoice' || card?.cardType !== CreditCardType.CREDIT)) {
        throw new BadRequestException('Installments are only imported from credit card invoices');
      }
      if (toCents(l.amount) <= 0) throw new BadRequestException('amount must be > 0');
    }
    await this.assertTenants(userId, input.lines.map((l) => l.tenantId));
    for (const id of new Set(input.lines.map((l) => l.categoryId).filter((v): v is string => !!v))) {
      await this.categories.assertUsable(id, userId);
    }

    const keys = input.lines.map((l) => l.key);
    const existing = keys.length
      ? new Set(
          [
            ...(await this.purchases.find({ where: { createdByUserId: userId, importKey: In(keys) }, select: { importKey: true } })),
            ...(await this.incomes.find({ where: { createdByUserId: userId, importKey: In(keys) }, select: { importKey: true } })),
          ].map((r) => r.importKey),
        )
      : new Set<string | null | undefined>();

    let purchases = 0;
    let incomes = 0;
    let skipped = 0;
    await this.dataSource.transaction(async (manager) => {
      const purchaseRepo = manager.getRepository(Purchase);
      const incomeRepo = manager.getRepository(IncomeSource);
      const seen = new Set<string>();
      for (const l of input.lines) {
        if (existing.has(l.key) || seen.has(l.key)) {
          skipped++;
          continue;
        }
        seen.add(l.key);
        const description = l.description.trim().slice(0, l.action === 'income' ? 180 : 255) || 'Lançamento importado';
        const date = l.date.slice(0, 10);
        if (l.action === 'income') {
          await incomeRepo.save(
            incomeRepo.create({
              tenantId: l.tenantId,
              description,
              amount: fromCents(toCents(l.amount)),
              incomeType: IncomeSourceType.ONE_TIME,
              startDate: date,
              endDate: null,
              createdByUserId: userId,
              importKey: l.key,
            }),
          );
          incomes++;
          continue;
        }
        const cents = toCents(l.amount);
        const inst = l.installment ?? null;
        await purchaseRepo.save(
          purchaseRepo.create({
            paymentMethod: card ? 'card' : l.paymentMethod ?? 'pix',
            creditCardId: card?.id ?? null,
            tenantId: l.tenantId,
            categoryId: l.categoryId ?? null,
            description,
            purchaseDate: date,
            // The bank prints each installment; the purchase stores the whole amount.
            totalAmount: fromCents(inst ? cents * inst.total : cents),
            isInstallment: !!inst,
            installmentsTotal: inst ? inst.total : null,
            installmentsPaid: inst ? inst.number - 1 : 0,
            createdByUserId: userId,
            importKey: l.key,
          }),
        );
        purchases++;
      }
      if (card && purchases) await this.statements.rebuildOpenStatements(manager, [card.id], userId);
    });
    return { purchases, incomes, skipped };
  }

  private async ownedCard(userId: string, id: string) {
    const card = await this.cards.findOne({ where: { id, createdByUserId: userId, active: true } });
    if (!card) throw new ForbiddenException('Credit card not found or inactive');
    return card;
  }

  private async assertTenants(userId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const found = await this.tenants.count({ where: { id: In(unique), createdByUserId: userId } });
    if (found !== unique.length) throw new ForbiddenException('Tenant not found or not owned by user');
  }

  /**
   * Records the user may have typed by hand for the same movement: same date and
   * amount (purchases of the card for invoices; Pix/cash purchases or one-time
   * incomes for bank statements).
   */
  private async possibleDuplicates(
    userId: string,
    kind: ImportKind,
    range: { from: string; to: string },
    creditCardId?: string,
  ) {
    const qb = this.purchases
      .createQueryBuilder('p')
      .where('p.createdByUserId = :userId', { userId })
      .andWhere('p.purchaseDate BETWEEN :from AND :to', range);
    if (kind === 'invoice') {
      if (!creditCardId) return null;
      qb.andWhere('p.creditCardId = :creditCardId', { creditCardId });
    } else {
      qb.andWhere('p.creditCardId IS NULL');
    }
    const purchases = await qb.getMany();
    const incomes =
      kind === 'statement'
        ? await this.incomes
            .createQueryBuilder('i')
            .where('i.createdByUserId = :userId', { userId })
            .andWhere('i.incomeType = :t', { t: IncomeSourceType.ONE_TIME })
            .andWhere('i.startDate BETWEEN :from AND :to', range)
            .getMany()
        : [];
    return (date: string, cents: number, direction: 'debit' | 'credit', installments: number | null) => {
      if (direction === 'credit') {
        return incomes.find((i) => String(i.startDate).slice(0, 10) === date && toCents(i.amount) === cents)
          ?.description;
      }
      return purchases.find((p) => {
        if (String(p.purchaseDate).slice(0, 10) !== date) return false;
        if (installments) {
          return p.installmentsTotal === installments && Math.abs(toCents(p.totalAmount) - cents * installments) <= installments;
        }
        return toCents(p.totalAmount) === cents;
      })?.description;
    };
  }

  /** Category from the user's own history (same description signature), then keywords. */
  private async categorySuggester(userId: string) {
    const history = await this.purchases
      .createQueryBuilder('p')
      .select(['p.description', 'p.categoryId'])
      .where('p.createdByUserId = :userId', { userId })
      .andWhere('p.categoryId IS NOT NULL')
      .getMany();
    const counts = new Map<string, Map<string, number>>();
    for (const p of history) {
      const sig = descriptionSignature(p.description);
      if (!sig) continue;
      const byCat = counts.get(sig) ?? new Map<string, number>();
      byCat.set(p.categoryId!, (byCat.get(p.categoryId!) ?? 0) + 1);
      counts.set(sig, byCat);
    }
    const categories = (await this.categories.list(userId)) as { id: string; name: string; isDefault: boolean }[];
    const defaultByName = new Map(categories.filter((c) => c.isDefault).map((c) => [c.name, c.id]));
    return (description: string): string | null => {
      const byCat = counts.get(descriptionSignature(description) || '\u0000');
      if (byCat) return [...byCat.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const name = keywordCategory(description);
      return name ? defaultByName.get(name) ?? null : null;
    };
  }
}
