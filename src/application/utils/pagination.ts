import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 10;

export type SortDir = 'asc' | 'desc';

/** Present only when the client asked for a page (`page` query param). */
export type PageRequest = {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: SortDir;
};

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

/** Builds a PageRequest from query params, or undefined when `page` is absent. */
export function pageRequest(q: {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: SortDir;
}): PageRequest | undefined {
  if (!q.page) return undefined;
  return {
    page: q.page,
    pageSize: q.pageSize ?? DEFAULT_PAGE_SIZE,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
  };
}

/**
 * Lists stay plain arrays unless a page was requested (selects, dashboard and
 * exports keep reading everything); with a page, returns { items, total, ... }.
 *
 * `sortable` maps the client's sort keys to `alias.property` column(s); unknown
 * keys fall back to `defaultOrder`, which also breaks ties. Only to-one joins
 * may be used: offset/limit is applied to the joined rows.
 */
export async function paginate<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  req: PageRequest | undefined,
  sortable: Record<string, string | string[]>,
  defaultOrder: [string, 'ASC' | 'DESC'][],
): Promise<T[] | Page<T>> {
  const mapped = req?.sortBy ? sortable[req.sortBy] : undefined;
  const dir = req?.sortDir === 'desc' ? 'DESC' : 'ASC';
  const columns = mapped === undefined ? [] : Array.isArray(mapped) ? mapped : [mapped];
  const order: [string, 'ASC' | 'DESC'][] = [
    ...columns.map((c): [string, 'ASC' | 'DESC'] => [c, dir]),
    ...defaultOrder,
  ];
  order.forEach(([col, dir], i) => {
    if (i === 0) qb.orderBy(col, dir, 'NULLS LAST');
    else qb.addOrderBy(col, dir, 'NULLS LAST');
  });
  qb.addOrderBy(`${qb.alias}.id`, 'ASC');

  if (!req) return qb.getMany();
  const [items, total] = await qb
    .offset((req.page - 1) * req.pageSize)
    .limit(req.pageSize)
    .getManyAndCount();
  return { items, total, page: req.page, pageSize: req.pageSize };
}
