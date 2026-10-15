import { ReportsService } from './reports.service';

function setup(rows: unknown[]) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['innerJoin', 'leftJoin', 'where', 'andWhere', 'select', 'addSelect', 'groupBy', 'addGroupBy']) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  const items = { createQueryBuilder: jest.fn(() => qb) };
  const none = {} as any;
  const service = new ReportsService(none, none, none, items as any, none, none, none, none);
  return { service, qb };
}

describe('ReportsService.totalsByCategory', () => {
  it('returns categories largest first, keeps uncategorized and drops zero totals', async () => {
    const { service, qb } = setup([
      { categoryId: 'c1', name: 'Lazer', icon: 'mdi-party-popper', totalAmount: '120.5' },
      { categoryId: null, name: null, icon: null, totalAmount: '30.00' },
      { categoryId: 'c2', name: 'Alimentação', icon: 'mdi-silverware-fork-knife', totalAmount: '410.10' },
      { categoryId: 'c3', name: 'Casa', icon: 'mdi-sofa-outline', totalAmount: '0.00' },
    ]);

    await expect(service.totalsByCategory('user-1', 2026, 10)).resolves.toEqual([
      { categoryId: 'c2', name: 'Alimentação', icon: 'mdi-silverware-fork-knife', totalAmount: '410.10' },
      { categoryId: 'c1', name: 'Lazer', icon: 'mdi-party-popper', totalAmount: '120.50' },
      { categoryId: null, name: null, icon: null, totalAmount: '30.00' },
    ]);
    expect(qb.andWhere).toHaveBeenCalledWith('cc.createdByUserId = :uid', { uid: 'user-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('cc.active = true');
  });
});
