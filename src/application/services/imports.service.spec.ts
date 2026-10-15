import { BadRequestException } from '@nestjs/common';
import { ImportsService } from './imports.service';

const USER = 'user-1';

function setup(opts: { existingKeys?: string[]; card?: object | null } = {}) {
  const existing = (opts.existingKeys ?? []).map((importKey) => ({ importKey }));
  const purchases = { find: jest.fn().mockResolvedValue(existing) };
  const incomes = { find: jest.fn().mockResolvedValue([]) };
  const cards = {
    findOne: jest.fn().mockResolvedValue(
      opts.card === undefined ? { id: 'card-1', cardType: 'credit', createdByUserId: USER } : opts.card,
    ),
  };
  const tenants = { count: jest.fn(async ({ where }: any) => where.id._value.length) };
  const saved: any[] = [];
  const repo = { create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => saved.push(x)) };
  const manager = { getRepository: (e: unknown) => ({ ...repo, entity: e }) };
  const savedPurchases = () => saved.filter((s) => 'totalAmount' in s);
  const dataSource = { transaction: jest.fn(async (work: any) => work(manager)) };
  const statements = { rebuildOpenStatements: jest.fn() };
  const categories = { assertUsable: jest.fn() };
  const service = new ImportsService(
    purchases as any, incomes as any, cards as any, tenants as any, {} as any,
    categories as any, statements as any, dataSource as any,
  );
  return { service, saved, savedPurchases, statements, manager, categories };
}

const line = (over: object = {}) => ({
  key: 'k1', action: 'purchase' as const, date: '2026-05-28', description: 'Loja', amount: '43.13',
  installment: null, tenantId: 't1', categoryId: 'c1', ...over,
});

describe('ImportsService.confirm', () => {
  it('stores an invoice installment as one purchase with the whole amount', async () => {
    const { service, savedPurchases, statements, manager } = setup();
    const r = await service.confirm(USER, {
      kind: 'invoice',
      creditCardId: 'card-1',
      lines: [line({ installment: { number: 4, total: 9 } }), line({ key: 'k2', amount: '10.00' })],
    });
    expect(r).toEqual({ purchases: 2, incomes: 0, skipped: 0 });
    expect(savedPurchases()[0]).toMatchObject({
      paymentMethod: 'card', creditCardId: 'card-1', purchaseDate: '2026-05-28',
      totalAmount: '388.17', isInstallment: true, installmentsTotal: 9, installmentsPaid: 3, importKey: 'k1',
    });
    expect(savedPurchases()[1]).toMatchObject({ totalAmount: '10.00', isInstallment: false, installmentsTotal: null });
    expect(statements.rebuildOpenStatements).toHaveBeenCalledTimes(1);
    expect(statements.rebuildOpenStatements).toHaveBeenCalledWith(manager, ['card-1'], USER);
  });

  it('turns statement debits into Pix/cash purchases and credits into one-time income', async () => {
    const { service, saved, statements } = setup({ card: null });
    const r = await service.confirm(USER, {
      kind: 'statement',
      lines: [line({ paymentMethod: 'cash' }), line({ key: 'k2', action: 'income', description: 'Salário', amount: '5000.00' })],
    });
    expect(r).toEqual({ purchases: 1, incomes: 1, skipped: 0 });
    expect(saved[0]).toMatchObject({ paymentMethod: 'cash', creditCardId: null, isInstallment: false });
    expect(saved[1]).toMatchObject({ incomeType: 'one_time', startDate: '2026-05-28', amount: '5000.00', importKey: 'k2' });
    expect(statements.rebuildOpenStatements).not.toHaveBeenCalled();
  });

  it('skips lines that were already imported', async () => {
    const { service, saved } = setup({ existingKeys: ['k1'] });
    const r = await service.confirm(USER, { kind: 'invoice', creditCardId: 'card-1', lines: [line(), line({ key: 'k2' })] });
    expect(r).toEqual({ purchases: 1, incomes: 0, skipped: 1 });
    expect(saved).toHaveLength(1);
  });

  it('rejects invalid combinations', async () => {
    const { service } = setup();
    await expect(service.confirm(USER, { kind: 'invoice', lines: [line()] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.confirm(USER, { kind: 'invoice', creditCardId: 'card-1', lines: [line({ action: 'income' })] }),
    ).rejects.toThrow('Invoice lines can only be imported as purchases');
    await expect(
      service.confirm(USER, { kind: 'statement', lines: [line({ installment: { number: 1, total: 2 } })] }),
    ).rejects.toThrow('Installments are only imported from credit card invoices');
  });

  it('refuses installments on a debit card', async () => {
    const { service } = setup({ card: { id: 'card-1', cardType: 'debit', createdByUserId: USER } });
    await expect(
      service.confirm(USER, { kind: 'invoice', creditCardId: 'card-1', lines: [line({ installment: { number: 1, total: 2 } })] }),
    ).rejects.toThrow('Installments are only imported from credit card invoices');
  });
});
