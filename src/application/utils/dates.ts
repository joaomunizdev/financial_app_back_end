/** Every month boundary and "today" in reports is evaluated in Brazilian time. */
export const REPORT_TIME_ZONE = 'America/Sao_Paulo';

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date (YYYY-MM-DD) in the report time zone. */
export function todayInReportTimeZone(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
  }).format(now);
}

/** Half-open month period [periodStart, periodEnd) as YYYY-MM-DD dates. */
export function monthPeriod(year: number, month: number) {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    periodStart: `${year}-${pad(month)}-01`,
    periodEnd: `${nextYear}-${pad(nextMonth)}-01`,
  };
}

/** Number of months from a to b, using only the YYYY-MM part of each date. */
export function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}
