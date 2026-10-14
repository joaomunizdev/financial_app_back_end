import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { Purchase } from '../../infrastructure/persistence/typeorm/entities/purchase.entity';

const USER = 'user-1';

function setup() {
  const purchases = { findOne: jest.fn() };
  const cards = {
    findOne: jest.fn().mockResolvedValue({ id: 'card-1', createdByUserId: USER }),
  };
  const tenants = {
    findOne: jest.fn().mockResolvedValue({ id: 'tenant-1', createdByUserId: USER }),
  };
  const statements = {
    rebuildOpenStatements: jest.fn(),
    assertPurchaseEditable: jest.fn(),
  };
  const txPurchases = {
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => ({ id: 'p-new', ...x })),
    delete: jest.fn(),
  };
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === Purchase) return txPurchases;
      throw new Error('unexpected repository');
    },
  };
  const dataSource = {
    transaction: jest.fn(async (work: (m: any) => unknown) => work(manager)),
  };
  const service = new PurchasesService(
    purchases as any,
    cards as any,
    tenants as any,
    statements as any,
    dataSource as any,
  );
  return { service, purchases, cards, tenants, statements, txPurchases, manager };
}

const input = () => ({
  creditCardId: 'card-1',
  tenantId: 'tenant-1',
  description: 'Notebook',
  purchaseDate: '2025-03-10',
  totalAmount: '6000.00',
  isInstallment: true,
  installmentsTotal: 10,
  installmentsPaid: 0,
});

const existing = () => ({
  id: 'p-1',
  createdByUserId: USER,
  creditCardId: 'card-1',
  tenantId: 'tenant-1',
  totalAmount: '100.00',
  isInstallment: false,
  installmentsTotal: null,
  installmentsPaid: 0,
});

describe('PurchasesService', () => {
  it("rejects a tenant that belongs to another user", async () => {
    const { service, tenants, txPurchases } = setup();
    tenants.findOne.mockResolvedValue(null);
    await expect(service.create(input(), USER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tenants.findOne).toHaveBeenCalledWith({
      where: { id: 'tenant-1', createdByUserId: USER },
    });
    expect(txPurchases.save).not.toHaveBeenCalled();
  });

  it('creates the purchase and refreshes open statements of its card', async () => {
    const { service, statements, manager } = setup();
    const created = await service.create(input(), USER);
    expect(created.id).toBe('p-new');
    expect(statements.rebuildOpenStatements).toHaveBeenCalledWith(
      manager,
      ['card-1'],
      USER,
    );
  });

  it('refuses to update a purchase that is in a closed statement', async () => {
    const { service, purchases, statements, txPurchases } = setup();
    purchases.findOne.mockResolvedValue(existing());
    statements.assertPurchaseEditable.mockRejectedValue(new ConflictException());

    await expect(
      service.update('p-1', { description: 'x' }, USER),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(txPurchases.save).not.toHaveBeenCalled();
  });

  it('refreshes open statements of both the old and the new card on update', async () => {
    const { service, purchases, statements, manager } = setup();
    purchases.findOne.mockResolvedValue(existing());

    await service.update('p-1', { creditCardId: 'card-2' }, USER);

    expect(statements.rebuildOpenStatements).toHaveBeenCalledWith(
      manager,
      ['card-1', 'card-2'],
      USER,
    );
  });

  it('rejects installment purchases on a debit card', async () => {
    const { service, cards, txPurchases } = setup();
    cards.findOne.mockResolvedValue({
      id: 'card-1',
      createdByUserId: USER,
      cardType: 'debit',
    });
    await expect(service.create(input(), USER)).rejects.toThrow(
      'Debit card purchases cannot be installments',
    );
    expect(txPurchases.save).not.toHaveBeenCalled();
  });

  it('accepts one-time purchases on a debit card', async () => {
    const { service, cards, txPurchases } = setup();
    cards.findOne.mockResolvedValue({
      id: 'card-1',
      createdByUserId: USER,
      cardType: 'debit',
    });
    await service.create(
      { ...input(), isInstallment: false, installmentsTotal: null },
      USER,
    );
    expect(txPurchases.save).toHaveBeenCalled();
  });

  it('rejects turning a debit purchase into installments on update', async () => {
    const { service, purchases, cards, txPurchases } = setup();
    purchases.findOne.mockResolvedValue(existing());
    cards.findOne.mockResolvedValue({
      id: 'card-1',
      createdByUserId: USER,
      cardType: 'debit',
    });
    await expect(
      service.update(
        'p-1',
        { isInstallment: true, installmentsTotal: 3, installmentsPaid: 0 },
        USER,
      ),
    ).rejects.toThrow('Debit card purchases cannot be installments');
    expect(txPurchases.save).not.toHaveBeenCalled();
  });

  it('checks tenant ownership when the tenant changes', async () => {
    const { service, purchases, tenants } = setup();
    purchases.findOne.mockResolvedValue(existing());
    tenants.findOne.mockResolvedValue(null);
    await expect(
      service.update('p-1', { tenantId: 'other' }, USER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to delete a purchase that is in a closed statement', async () => {
    const { service, purchases, statements, txPurchases } = setup();
    purchases.findOne.mockResolvedValue(existing());
    statements.assertPurchaseEditable.mockRejectedValue(new ConflictException());

    await expect(service.remove('p-1', USER)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(txPurchases.delete).not.toHaveBeenCalled();
  });

  it('deletes and refreshes open statements when allowed', async () => {
    const { service, purchases, statements, txPurchases, manager } = setup();
    purchases.findOne.mockResolvedValue(existing());

    await service.remove('p-1', USER);

    expect(txPurchases.delete).toHaveBeenCalledWith('p-1');
    expect(statements.rebuildOpenStatements).toHaveBeenCalledWith(
      manager,
      ['card-1'],
      USER,
    );
  });
});
