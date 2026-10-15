import type { MovementKind } from '../../infrastructure/persistence/typeorm/entities/investment.entity';
import { toCents } from './money';

export type MovementLike = {
  kind: MovementKind;
  amount: string;
  /** YYYY-MM-DD */
  date: string;
  createdAt?: Date;
};

const day = (d: string) => String(d).slice(0, 10);

/**
 * Value of one investment at the end of `date` (YYYY-MM-DD), in cents: the last
 * balance update up to that day plus contributions minus withdrawals dated after
 * it. Movements on the balance's own day are considered part of that balance.
 * Without any balance update, contributions minus withdrawals.
 */
export function valueAtCents(movements: MovementLike[], date: string): number {
  const upTo = movements.filter((m) => day(m.date) <= date);
  const balances = upTo
    .filter((m) => m.kind === 'balance')
    .sort(
      (a, b) =>
        day(a.date).localeCompare(day(b.date)) ||
        (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
    );
  const last = balances[balances.length - 1];
  let cents = last ? toCents(last.amount) : 0;
  for (const m of upTo) {
    if (last && day(m.date) <= day(last.date)) continue;
    if (m.kind === 'contribution') cents += toCents(m.amount);
    if (m.kind === 'withdrawal') cents -= toCents(m.amount);
  }
  return cents;
}

/** Contributions minus withdrawals (all time), in cents. */
export function netInvestedCents(movements: MovementLike[]): number {
  return movements.reduce((sum, m) => {
    if (m.kind === 'contribution') return sum + toCents(m.amount);
    if (m.kind === 'withdrawal') return sum - toCents(m.amount);
    return sum;
  }, 0);
}

/** Last day of a month as YYYY-MM-DD. */
export function monthEnd(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

/** The `count` months ending at year/month, oldest first. */
export function lastMonths(year: number, month: number, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const index = year * 12 + (month - 1) - (count - 1 - i);
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  });
}
