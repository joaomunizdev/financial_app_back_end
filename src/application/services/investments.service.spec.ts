import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InvestmentsService } from './investments.service';

const USER = 'user-1';
const inv = (id: string, type: string, owner = USER) => ({ id, name: id, type, institution: null, createdByUserId: owner });
const mv = (investmentId: string, kind: string, amount: string, date: string) => ({ investmentId, kind, amount, date });

function setup(investments: any[], movements: any[]) {
  const invRepo = {
    find: jest.fn().mockResolvedValue(investments),
    findOne: jest.fn(async ({ where }: any) => investments.find((i) => i.id === where.id) ?? null),
  };
  const mvRepo = {
    find: jest.fn(async ({ where }: any) => {
      const ids = where.investmentId?._value ?? [where.investmentId];
      return movements.filter((m) => ids.includes(m.investmentId));
    }),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => ({ id: 'm-new', ...x })),
  };
  return { service: new InvestmentsService(invRepo as any, mvRepo as any), mvRepo };
}

describe('InvestmentsService', () => {
  it('summarizes value, month contributions, 6-month history and value by type', async () => {
    const { service } = setup(
      [inv('cdb', 'fixed_income'), inv('btc', 'crypto'), inv('acao', 'stocks')],
      [
        mv('cdb', 'contribution', '1000.00', '2026-05-10'),
        mv('cdb', 'balance', '1100.00', '2026-09-30'),
        mv('cdb', 'contribution', '200.00', '2026-10-05'),
        mv('btc', 'contribution', '500.00', '2026-10-12'),
        mv('btc', 'withdrawal', '100.00', '2026-10-20'),
        mv('acao', 'contribution', '300.00', '2026-11-01'),
      ],
    );
    const s = await service.summary(USER, 2026, 10);
    expect(s.totalValue).toBe('1700.00');
    expect(s.contributions).toBe('700.00');
    expect(s.withdrawals).toBe('100.00');
    expect(s.history.map((h) => `${h.month}:${h.value}`)).toEqual([
      '5:1000.00', '6:1000.00', '7:1000.00', '8:1000.00', '9:1100.00', '10:1700.00',
    ]);
    // Fixed type order, zero types left out (stocks only starts in November).
    expect(s.byType).toEqual([
      { type: 'fixed_income', value: '1300.00' },
      { type: 'crypto', value: '400.00' },
    ]);
  });

  it('refuses a withdrawal above the value on that date', async () => {
    const { service, mvRepo } = setup([inv('cdb', 'fixed_income')], [mv('cdb', 'contribution', '100.00', '2026-01-01')]);
    await expect(
      service.addMovement('cdb', USER, { kind: 'withdrawal', amount: '150.00', date: '2026-02-01' }),
    ).rejects.toThrow('Withdrawal exceeds the investment value on that date');
    expect(mvRepo.save).not.toHaveBeenCalled();
  });

  it('requires a positive amount for contributions but accepts a zero balance', async () => {
    const { service, mvRepo } = setup([inv('cdb', 'fixed_income')], []);
    await expect(
      service.addMovement('cdb', USER, { kind: 'contribution', amount: '0.00', date: '2026-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.addMovement('cdb', USER, { kind: 'balance', amount: '0', date: '2026-01-01T00:00:00Z' });
    expect(mvRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'balance', amount: '0.00', date: '2026-01-01' }),
    );
  });

  it("refuses another user's investment", async () => {
    const { service } = setup([inv('cdb', 'fixed_income', 'user-2')], []);
    await expect(service.listMovements('cdb', USER)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
