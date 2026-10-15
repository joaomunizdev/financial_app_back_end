import { pageRequest, paginate } from './pagination';

function qb() {
  const q: Record<string, jest.Mock> & { alias: string } = { alias: 'p' } as any;
  for (const m of ['orderBy', 'addOrderBy', 'offset', 'limit']) q[m] = jest.fn(() => q);
  q.getMany = jest.fn().mockResolvedValue(['all']);
  q.getManyAndCount = jest.fn().mockResolvedValue([['a', 'b'], 12]);
  return q;
}

describe('pagination', () => {
  it('only pages when the client sends page', () => {
    expect(pageRequest({})).toBeUndefined();
    expect(pageRequest({ page: 2 })).toEqual({ page: 2, pageSize: 10, sortBy: undefined, sortDir: undefined });
  });

  it('returns the plain list without a page request, in the default order', async () => {
    const q = qb();
    await expect(paginate(q as any, undefined, {}, [['p.date', 'DESC']])).resolves.toEqual(['all']);
    expect(q.orderBy).toHaveBeenCalledWith('p.date', 'DESC', 'NULLS LAST');
    expect(q.addOrderBy).toHaveBeenCalledWith('p.id', 'ASC');
    expect(q.offset).not.toHaveBeenCalled();
  });

  it('pages with offset/limit and sorts by the mapped column(s) first', async () => {
    const q = qb();
    const result = await paginate(
      q as any,
      { page: 3, pageSize: 5, sortBy: 'period', sortDir: 'desc' },
      { period: ['p.year', 'p.month'] },
      [['p.date', 'DESC']],
    );
    expect(result).toEqual({ items: ['a', 'b'], total: 12, page: 3, pageSize: 5 });
    expect(q.offset).toHaveBeenCalledWith(10);
    expect(q.limit).toHaveBeenCalledWith(5);
    expect(q.orderBy).toHaveBeenCalledWith('p.year', 'DESC', 'NULLS LAST');
    expect(q.addOrderBy).toHaveBeenCalledWith('p.month', 'DESC', 'NULLS LAST');
  });

  it('ignores unknown sort keys', async () => {
    const q = qb();
    await paginate(q as any, { page: 1, pageSize: 10, sortBy: 'password' }, { name: 'p.name' }, [
      ['p.name', 'ASC'],
    ]);
    expect(q.orderBy).toHaveBeenCalledWith('p.name', 'ASC', 'NULLS LAST');
  });
});
