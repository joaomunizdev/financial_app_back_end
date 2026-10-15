import { ReportsService } from './reports.service';

function queryBuilder(rows: unknown[]) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['innerJoin', 'leftJoin', 'where', 'andWhere', 'select', 'addSelect', 'groupBy', 'addGroupBy']) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  return qb;
}

function setup(itemRows: unknown[], directRows: unknown[] = []) {
  const itemsQb = queryBuilder(itemRows);
  const directQb = queryBuilder(directRows);
  const items = { createQueryBuilder: jest.fn(() => itemsQb) };
  const purchases = { createQueryBuilder: jest.fn(() => directQb) };
  const none = {} as any;
  const service = new ReportsService(purchases as any, none, none, items as any, none, none, none, none);
  return { service, itemsQb, directQb };
}

const row = (categoryId: string | null, name: string | null, totalAmount: string) => ({
  categoryId,
  name,
  icon: name ? `mdi-${name.toLowerCase()}` : null,
  totalAmount,
});

describe('ReportsService.totalsByCategory', () => {
  it('returns categories largest first, keeps uncategorized and drops zero totals', async () => {
    const { service, itemsQb } = setup([
      row('c1', 'Lazer', '120.5'),
      row(null, null, '30.00'),
      row('c2', 'Mercado', '410.10'),
      row('c3', 'Casa', '0.00'),
    ]);

    await expect(service.totalsByCategory('user-1', 2026, 10)).resolves.toEqual([
      { ...row('c2', 'Mercado', '410.10') },
      { ...row('c1', 'Lazer', '120.50') },
      { ...row(null, null, '30.00') },
    ]);
    expect(itemsQb.andWhere).toHaveBeenCalledWith('cc.createdByUserId = :uid', { uid: 'user-1' });
    expect(itemsQb.andWhere).toHaveBeenCalledWith('cc.active = true');
  });

  it('adds Pix/cash purchases of the month to the same categories', async () => {
    const { service, directQb } = setup(
      [row('c1', 'Lazer', '100.00')],
      [row('c1', 'Lazer', '50.25'), row('c4', 'Saúde', '200.00'), row(null, null, '5.00')],
    );
    await expect(service.totalsByCategory('user-1', 2026, 12)).resolves.toEqual([
      row('c4', 'Saúde', '200.00'),
      row('c1', 'Lazer', '150.25'),
      row(null, null, '5.00'),
    ]);
    expect(directQb.andWhere).toHaveBeenCalledWith('dp.creditCardId IS NULL');
    expect(directQb.andWhere).toHaveBeenCalledWith(
      'dp.purchaseDate >= :dpStart AND dp.purchaseDate < :dpEnd',
      { dpStart: '2026-12-01', dpEnd: '2027-01-01' },
    );
  });
});
