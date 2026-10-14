import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { StatementsService } from './statements.service';
import { Statement } from '../../infrastructure/persistence/typeorm/entities/statement.entity';
import { StatementItem } from '../../infrastructure/persistence/typeorm/entities/statement-item.entity';
import { Purchase } from '../../infrastructure/persistence/typeorm/entities/purchase.entity';
import { Subscription } from '../../infrastructure/persistence/typeorm/entities/subscription.entity';

const USER = 'user-1';
const CARD = 'card-1';

function makeRepo() {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => x),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

function countQuery(count: number) {
  const qb: any = {
    innerJoin: () => qb,
    where: () => qb,
    andWhere: () => qb,
    getCount: async () => count,
  };
  return qb;
}

function setup() {
  // Repositories injected into the service (used outside transactions).
  const statements = makeRepo();
  const cards = makeRepo();

  // Repositories handed out by the transaction's EntityManager.
  const tx = {
    statements: makeRepo(),
    items: makeRepo(),
    purchases: makeRepo(),
    subs: makeRepo(),
  };
  tx.statements.save.mockImplementation(async (s: any) => {
    if (!s.id) s.id = 'st-new';
    return s;
  });

  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === Statement) return tx.statements;
      if (entity === StatementItem) return tx.items;
      if (entity === Purchase) return tx.purchases;
      if (entity === Subscription) return tx.subs;
      throw new Error('unexpected repository');
    },
  };
  const dataSource = {
    transaction: jest.fn(async (work: (m: any) => unknown) => work(manager)),
  };

  cards.findOne.mockResolvedValue({ id: CARD, createdByUserId: USER });
  statements.findOne.mockImplementation(async ({ where }: any) => ({
    id: where.id,
    creditCard: { createdByUserId: USER, active: true },
  }));

  const service = new StatementsService(
    statements as any,
    cards as any,
    dataSource as any,
  );
  return { service, statements, cards, tx, dataSource, manager };
}

const generateParams = { creditCardId: CARD, userId: USER, year: 2025, month: 3 };

describe('StatementsService.generate', () => {
  it('rejects a card that is not owned or inactive', async () => {
    const { service, cards } = setup();
    cards.findOne.mockResolvedValue(null);
    await expect(service.generate(generateParams)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each([
    ['locked', { locked: true, paidAt: null }],
    ['paid', { locked: false, paidAt: new Date() }],
  ])('refuses to regenerate a %s statement', async (_, state) => {
    const { service, tx } = setup();
    tx.statements.findOne.mockResolvedValue({ id: 'st-1', ...state });

    await expect(service.generate(generateParams)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.items.delete).not.toHaveBeenCalled();
    expect(tx.statements.save).not.toHaveBeenCalled();
  });

  it('locks the existing row while regenerating', async () => {
    const { service, tx } = setup();
    await service.generate(generateParams);
    expect(tx.statements.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('only snapshots active subscriptions of the card owner', async () => {
    const { service, tx } = setup();
    tx.statements.findOne.mockResolvedValue(null);
    await service.generate(generateParams);
    expect(tx.subs.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { creditCardId: CARD, createdByUserId: USER, active: true },
      }),
    );
  });

  it('regenerates an open statement in place, resetting the adjustment', async () => {
    const { service, tx } = setup();
    const existing = {
      id: 'st-1',
      locked: false,
      paidAt: null,
      adjustmentAmount: '45.90',
      totalAmount: '145.90',
    };
    tx.statements.findOne.mockResolvedValue(existing);

    const result = await service.generate(generateParams);

    expect(tx.items.delete).toHaveBeenCalledWith({ statementId: 'st-1' });
    expect(existing.adjustmentAmount).toBe('0.00');
    expect(existing.totalAmount).toBe('0.00');
    expect(result.id).toBe('st-1');
  });

  it('splits installments by purchase month, last installment absorbs the remainder', async () => {
    const { service, tx } = setup();
    tx.statements.findOne.mockResolvedValue(null);
    tx.purchases.find.mockResolvedValue([
      {
        id: 'p-1',
        isInstallment: true,
        installmentsTotal: 3,
        totalAmount: '100.00',
        purchaseDate: '2025-01-15',
      },
    ]);

    await service.generate(generateParams); // March = installment 3/3

    const saved = tx.items.save.mock.calls[0][0];
    expect(saved).toEqual([
      expect.objectContaining({
        purchaseId: 'p-1',
        label: 'Parcela 3/3',
        amount: '33.34',
        installmentNumber: 3,
      }),
    ]);
  });

  it('uses the rounded per-installment amount before the last one', async () => {
    const { service, tx } = setup();
    tx.statements.findOne.mockResolvedValue(null);
    tx.purchases.find.mockResolvedValue([
      {
        id: 'p-1',
        isInstallment: true,
        installmentsTotal: 3,
        totalAmount: '100.00',
        purchaseDate: '2025-02-01',
      },
    ]);

    await service.generate(generateParams); // March = installment 2/3

    expect(tx.items.save.mock.calls[0][0][0]).toEqual(
      expect.objectContaining({ amount: '33.33', installmentNumber: 2 }),
    );
  });

  it('includes only one-time purchases from the target month and snapshots subscriptions as items', async () => {
    const { service, tx } = setup();
    tx.statements.findOne.mockResolvedValue(null);
    tx.subs.find.mockResolvedValue([
      { id: 'sub-1', description: 'Netflix', amount: '39.90', tenantId: 't-2' },
    ]);
    tx.purchases.find.mockResolvedValue([
      {
        id: 'p-in',
        isInstallment: false,
        installmentsTotal: null,
        totalAmount: '350.40',
        purchaseDate: '2025-03-10',
        tenantId: 't-1',
      },
      {
        id: 'p-out',
        isInstallment: false,
        installmentsTotal: null,
        totalAmount: '99.00',
        purchaseDate: '2025-04-01',
      },
    ]);

    await service.generate(generateParams);

    expect(tx.items.save.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        kind: 'purchase',
        purchaseId: 'p-in',
        label: 'Compra à vista',
        installmentNumber: null,
      }),
      expect.objectContaining({
        kind: 'subscription',
        subscriptionId: 'sub-1',
        tenantId: 't-2',
        label: 'Netflix',
        amount: '39.90',
      }),
    ]);
    const lastSave = tx.statements.save.mock.calls.at(-1)![0];
    expect(lastSave.totalAmount).toBe('390.30');
  });
});

describe('StatementsService.pay', () => {
  it('requires the statement to be locked (checked under the row lock)', async () => {
    const { service, tx } = setup();
    tx.statements.findOne.mockResolvedValue({ id: 'st-1', locked: false });

    await expect(service.pay('st-1', USER, '100.00')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.statements.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('sets installmentsPaid to the paid installment number, never decreasing it', async () => {
    const { service, tx } = setup();
    const stmt = { id: 'st-1', locked: true, paidAt: null } as any;
    tx.statements.findOne.mockResolvedValue(stmt);
    const behind = { id: 'p-1', isInstallment: true, installmentsTotal: 6, installmentsPaid: 1 };
    const ahead = { id: 'p-2', isInstallment: true, installmentsTotal: 6, installmentsPaid: 5 };
    const oneTime = { id: 'p-3', isInstallment: false, installmentsTotal: null, installmentsPaid: 0 };
    tx.items.find.mockResolvedValue([
      { installmentNumber: 3, purchase: behind },
      { installmentNumber: 3, purchase: ahead },
      { installmentNumber: null, purchase: oneTime },
    ]);

    await service.pay('st-1', USER, '500.00', '2025-04-10');

    expect(behind.installmentsPaid).toBe(3);
    expect(ahead.installmentsPaid).toBe(5);
    expect(tx.purchases.save).toHaveBeenCalledWith([behind]);
    expect(stmt.paidAmount).toBe('500.00');
    expect(stmt.paidAt).toEqual(new Date('2025-04-10T00:00:00Z'));
  });

  it('only updates amount/date when the statement is already paid', async () => {
    const { service, tx } = setup();
    const stmt = { id: 'st-1', locked: true, paidAt: new Date('2025-04-01') } as any;
    tx.statements.findOne.mockResolvedValue(stmt);

    await service.pay('st-1', USER, '510.00');

    expect(tx.items.find).not.toHaveBeenCalled();
    expect(tx.purchases.save).not.toHaveBeenCalled();
    expect(stmt.paidAmount).toBe('510.00');
  });
});

describe('StatementsService.update', () => {
  function withStatement(state: object) {
    const ctx = setup();
    const st = {
      id: 'st-1',
      totalAmount: '100.00',
      adjustmentAmount: '0.00',
      locked: false,
      paidAt: null,
      creditCard: { createdByUserId: USER, active: true },
      ...state,
    };
    ctx.statements.findOne.mockResolvedValue(st);
    return { ...ctx, st };
  }

  it.each([
    { adjustmentAmount: '10.00' },
    { closingDate: '2025-03-10' },
    { dueDate: '2025-03-17' },
  ])('rejects %p on a locked statement', async (patch) => {
    const { service } = withStatement({ locked: true });
    await expect(service.update('st-1', USER, patch as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects unlocking a paid statement', async () => {
    const { service } = withStatement({ locked: true, paidAt: new Date() });
    await expect(
      service.update('st-1', USER, { locked: false } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows unlocking an unpaid statement', async () => {
    const { service, st, statements } = withStatement({ locked: true });
    await service.update('st-1', USER, { locked: false } as any);
    expect(statements.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'st-1', locked: false }),
    );
    expect(st.locked).toBe(false);
  });

  it('applies the adjustment delta to the total on an open statement', async () => {
    const { service, st } = withStatement({
      totalAmount: '110.00',
      adjustmentAmount: '10.00',
    });
    await service.update('st-1', USER, { adjustmentAmount: '-5.00' } as any);
    expect(st.totalAmount).toBe('95.00');
    expect(st.adjustmentAmount).toBe('-5.00');
  });
});

describe('StatementsService.rebuildOpenStatements', () => {
  it('rebuilds only open statements of the given cards, keeping the adjustment', async () => {
    const { service, tx, manager } = setup();
    const open = {
      id: 'st-open',
      creditCardId: CARD,
      year: 2025,
      month: 3,
      adjustmentAmount: '-10.00',
      totalAmount: '0.00',
    };
    tx.statements.find.mockResolvedValue([open]);
    tx.purchases.find.mockResolvedValue([
      {
        id: 'p-1',
        isInstallment: false,
        totalAmount: '100.00',
        purchaseDate: '2025-03-05',
        tenantId: 't-1',
      },
    ]);

    await service.rebuildOpenStatements(manager as any, [CARD, CARD], USER);

    const where = tx.statements.find.mock.calls[0][0].where;
    expect(where.locked).toBe(false);
    expect(where.creditCardId.value).toEqual([CARD]);
    expect(tx.items.delete).toHaveBeenCalledWith({ statementId: 'st-open' });
    expect(open.adjustmentAmount).toBe('-10.00');
    expect(open.totalAmount).toBe('90.00');
  });

  it('does nothing without card ids', async () => {
    const { service, tx, manager } = setup();
    await service.rebuildOpenStatements(manager as any, [], USER);
    expect(tx.statements.find).not.toHaveBeenCalled();
  });
});

describe('StatementsService.assertPurchaseEditable', () => {
  it('rejects purchases that appear in a locked or paid statement', async () => {
    const { service, tx, manager } = setup();
    tx.items.createQueryBuilder.mockReturnValue(countQuery(1));
    await expect(
      service.assertPurchaseEditable(manager as any, 'p-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows purchases only present in open statements', async () => {
    const { service, tx, manager } = setup();
    tx.items.createQueryBuilder.mockReturnValue(countQuery(0));
    await expect(
      service.assertPurchaseEditable(manager as any, 'p-1'),
    ).resolves.toBeUndefined();
  });
});
