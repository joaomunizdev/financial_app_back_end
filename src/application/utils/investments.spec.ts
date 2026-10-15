import { lastMonths, monthEnd, netInvestedCents, valueAtCents } from './investments';

const m = (kind: 'contribution' | 'withdrawal' | 'balance', amount: string, date: string) => ({
  kind,
  amount,
  date,
});

describe('investment valuation', () => {
  it('sums contributions minus withdrawals while no balance was reported', () => {
    const mv = [m('contribution', '1000.00', '2026-01-10'), m('withdrawal', '200.50', '2026-02-01')];
    expect(valueAtCents(mv, '2026-01-31')).toBe(100000);
    expect(valueAtCents(mv, '2026-02-28')).toBe(79950);
    expect(valueAtCents(mv, '2025-12-31')).toBe(0);
  });

  it('starts from the last balance up to the date and adds later movements', () => {
    const mv = [
      m('contribution', '1000.00', '2026-01-10'),
      m('balance', '1050.00', '2026-01-31'),
      m('contribution', '500.00', '2026-01-31'), // same day: inside the balance
      m('contribution', '300.00', '2026-02-05'),
      m('balance', '1400.00', '2026-03-31'),
      m('withdrawal', '100.00', '2026-04-02'),
    ];
    expect(valueAtCents(mv, '2026-01-31')).toBe(105000);
    expect(valueAtCents(mv, '2026-02-28')).toBe(135000);
    expect(valueAtCents(mv, '2026-03-31')).toBe(140000);
    expect(valueAtCents(mv, '2026-04-30')).toBe(130000);
    expect(netInvestedCents(mv)).toBe(170000);
  });

  it('uses the latest balance recorded for the same day', () => {
    const mv = [
      { ...m('balance', '10.00', '2026-01-31'), createdAt: new Date('2026-02-01T10:00:00Z') },
      { ...m('balance', '12.00', '2026-01-31'), createdAt: new Date('2026-02-01T11:00:00Z') },
    ];
    expect(valueAtCents(mv, '2026-01-31')).toBe(1200);
  });

  it('computes month ends and month windows', () => {
    expect(monthEnd(2024, 2)).toBe('2024-02-29');
    expect(monthEnd(2026, 12)).toBe('2026-12-31');
    expect(lastMonths(2026, 2, 3)).toEqual([
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });
});
