import {
  fromCents,
  installmentAmountCents,
  splitInstallments,
  toCents,
} from './money';
import { addMonths, monthDiff, monthPeriod, todayInReportTimeZone } from './dates';

describe('money', () => {
  it('converts amounts to integer cents without float drift', () => {
    expect(toCents('1234.56')).toBe(123456);
    expect(toCents('0.1')).toBe(10);
    expect(toCents(null)).toBe(0);
    expect(fromCents(toCents('0.1') + toCents('0.2'))).toBe('0.30');
    expect(fromCents(-8000)).toBe('-80.00');
  });

  it('puts the rounding remainder in the last installment', () => {
    expect(splitInstallments(10000, 3)).toEqual({ per: 3333, last: 3334 });
    expect(splitInstallments(600000, 10)).toEqual({ per: 60000, last: 60000 });
    expect(splitInstallments(1000, 6)).toEqual({ per: 167, last: 165 });
    expect(installmentAmountCents(10000, 3, 1)).toBe(3333);
    expect(installmentAmountCents(10000, 3, 3)).toBe(3334);
  });

  it('installments always add up to the total', () => {
    for (const [total, parts] of [
      [10000, 3],
      [99999, 7],
      [1, 12],
      [123457, 11],
    ]) {
      let sum = 0;
      for (let k = 1; k <= parts; k++) sum += installmentAmountCents(total, parts, k);
      expect(sum).toBe(total);
    }
  });
});

describe('dates', () => {
  it('builds half-open month periods, rolling over December', () => {
    expect(monthPeriod(2025, 3)).toEqual({
      periodStart: '2025-03-01',
      periodEnd: '2025-04-01',
    });
    expect(monthPeriod(2025, 12)).toEqual({
      periodStart: '2025-12-01',
      periodEnd: '2026-01-01',
    });
  });

  it('adds months clamping the day to the end of the target month', () => {
    expect(addMonths('2026-08-09', 0)).toBe('2026-08-09');
    expect(addMonths('2026-08-09', 5)).toBe('2027-01-09');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-10-31', 13)).toBe('2027-11-30');
  });

  it('computes month differences by year-month', () => {
    expect(monthDiff('2025-01-31', '2025-03-01')).toBe(2);
    expect(monthDiff('2024-11-15', '2025-02-15')).toBe(3);
    expect(monthDiff('2025-05-01', '2025-04-30')).toBe(-1);
  });

  it("uses Brazilian time for today's date", () => {
    // 01:30 UTC on April 1st is still March 31st in São Paulo (UTC-3)
    expect(todayInReportTimeZone(new Date('2025-04-01T01:30:00Z'))).toBe(
      '2025-03-31',
    );
  });
});
