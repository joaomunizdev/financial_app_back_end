import { ConflictException } from '@nestjs/common';
import { CreditCardsService } from './credit-cards.service';
import { CreditCard } from '../../infrastructure/persistence/typeorm/entities/credit-card.entity';
import { Purchase } from '../../infrastructure/persistence/typeorm/entities/purchase.entity';
import { StatementItem } from '../../infrastructure/persistence/typeorm/entities/statement-item.entity';

const USER = 'user-1';

const creditCard = () => ({
  id: 'card-1',
  createdByUserId: USER,
  cardType: 'credit',
  nickname: 'Debito',
});

const installmentPurchase = () => ({
  id: 'p-1',
  creditCardId: 'card-1',
  tenantId: 'tenant-1',
  createdByUserId: USER,
  description: 'Bicicleta',
  purchaseDate: '2026-01-31',
  totalAmount: '100.00',
  isInstallment: true,
  installmentsTotal: 3,
  installmentsPaid: 1,
});

function setup(installments = [installmentPurchase()]) {
  const cards = {
    findOne: jest.fn().mockResolvedValue(creditCard()),
    save: jest.fn(async (x: any) => x),
  };
  let seq = 0;
  const txPurchases = {
    find: jest.fn().mockResolvedValue(installments),
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => ({ id: `new-${++seq}`, ...x })),
    delete: jest.fn(),
  };
  const txItems = {
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  };
  const txCards = { save: jest.fn(async (x: any) => x) };
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === Purchase) return txPurchases;
      if (entity === StatementItem) return txItems;
      if (entity === CreditCard) return txCards;
      throw new Error('unexpected repository');
    },
  };
  const dataSource = {
    transaction: jest.fn(async (work: (m: any) => unknown) => work(manager)),
  };
  const statementsService = { rebuildOpenStatements: jest.fn() };
  const service = new CreditCardsService(
    cards as any,
    {} as any,
    {} as any,
    statementsService as any,
    dataSource as any,
  );
  return { service, cards, txPurchases, txItems, txCards, dataSource, statementsService, manager };
}

describe('CreditCardsService.update', () => {
  it('saves other changes without a conversion', async () => {
    const { service, cards, dataSource } = setup();
    await service.update('card-1', { nickname: 'Novo' }, USER);
    expect(cards.save).toHaveBeenCalledWith(expect.objectContaining({ nickname: 'Novo' }));
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('splits installment purchases into monthly purchases when switching to debit', async () => {
    const { service, txPurchases, txItems, txCards, statementsService, manager } = setup();

    await service.update('card-1', { cardType: 'debit' as any }, USER);

    expect(txCards.save).toHaveBeenCalledWith(expect.objectContaining({ cardType: 'debit' }));
    const created = txPurchases.save.mock.calls.map(([p]) => p);
    expect(created).toEqual([
      expect.objectContaining({
        description: 'Bicicleta',
        purchaseDate: '2026-01-31',
        totalAmount: '33.33',
        isInstallment: false,
        installmentsTotal: null,
        installmentsPaid: 0,
        tenantId: 'tenant-1',
        creditCardId: 'card-1',
      }),
      expect.objectContaining({ description: 'Bicicleta', purchaseDate: '2026-02-28', totalAmount: '33.33' }),
      expect.objectContaining({ description: 'Bicicleta', purchaseDate: '2026-03-31', totalAmount: '33.34' }),
    ]);
    // Existing statement items (also in closed statements) follow their installment
    // to the new purchase and read like any one-time purchase.
    expect(txItems.update).toHaveBeenNthCalledWith(
      2,
      { purchaseId: 'p-1', installmentNumber: 2 },
      { purchaseId: 'new-2', installmentNumber: null, label: 'Compra à vista' },
    );
    expect(txPurchases.delete).toHaveBeenCalledWith('p-1');
    expect(statementsService.rebuildOpenStatements).toHaveBeenCalledWith(manager, ['card-1'], USER);
  });

  it('aborts when a statement item cannot be matched to an installment', async () => {
    const { service, txItems, txPurchases } = setup();
    txItems.count.mockResolvedValue(1);
    await expect(
      service.update('card-1', { cardType: 'debit' as any }, USER),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(txPurchases.delete).not.toHaveBeenCalled();
  });

  it('does not convert again when the card is already debit', async () => {
    const { service, cards, dataSource } = setup();
    cards.findOne.mockResolvedValue({ ...creditCard(), cardType: 'debit' });
    await service.update('card-1', { cardType: 'debit' as any }, USER);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
