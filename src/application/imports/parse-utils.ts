import type { PdfItem, PdfLine } from './pdf-text';

/** Lowercase, no accents, single spaces — for matching labels and descriptions. */
export function norm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Brazilian money text to signed cents: "1.234,56", "R$ -1.238,43", "246,68-",
 * "−R$ 336,79", "+ 2.732,29". Returns null when the text is not an amount.
 */
export function parseBRL(text: string): number | null {
  const t = text.replace(/\s/g, '').replace(/[−–]/g, '-').replace(/^R\$/i, '');
  const m = /^([+-]?)(?:R\$)?([+-]?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})(-?)$/i.exec(t);
  if (!m) return null;
  const cents = Number(m[3].replace(/\./g, '')) * 100 + Number(m[4]);
  const negative = m[1] === '-' || m[2] === '-' || m[5] === '-';
  return negative ? -cents : cents;
}

/** "1234.56" / "-112.00" (OFX, Nubank CSV) to signed cents. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const isoDate = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8,
  setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/** "SET", "set", "setembro", "Março" → 9 / 3; null when unknown. */
export function monthFromName(name: string): number | null {
  return MONTHS[norm(name)] ?? null;
}

/** "dd/mm/yyyy" or "dd-mm-yyyy" → ISO; null when it isn't one. */
export function parseFullDate(text: string): string | null {
  const m = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(text.trim());
  if (!m) return null;
  return isoDate(Number(m[3]), Number(m[2]), Number(m[1]));
}

/** Adds (or subtracts) calendar months, clamping the day to the month's end. */
export function addMonthsISO(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return isoDate(year, month, Math.min(d, last));
}

function monthIndex(date: string) {
  const [y, m] = date.split('-').map(Number);
  return y * 12 + m - 1;
}

/**
 * Year for a day/month printed without year, relative to the document date.
 * One-time lines take the latest year not after the reference. Installment k
 * (dated at the original purchase) takes the year that puts it k−1 months
 * before the reference month.
 */
export function inferYear(day: number, month: number, reference: string, installmentNumber?: number) {
  const refYear = Number(reference.slice(0, 4));
  const candidates = [refYear + 1, refYear, refYear - 1, refYear - 2, refYear - 3].map((y) =>
    isoDate(y, month, day),
  );
  if (installmentNumber && installmentNumber > 1) {
    const target = monthIndex(reference) - (installmentNumber - 1);
    return candidates.reduce((best, c) =>
      Math.abs(monthIndex(c) - target) < Math.abs(monthIndex(best) - target) ? c : best,
    );
  }
  return candidates.find((c) => c <= reference) ?? candidates[candidates.length - 1];
}

/** Installment marker at the end of a description, removed from it. */
export function splitInstallment(description: string): {
  description: string;
  installment: { number: number; total: number } | null;
} {
  const patterns = [
    /\s*-?\s*parcela\s+(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*$/i, // "- Parcela 4/9", "Parcela 1 de 10"
    /\s*\((\d{1,2})\/(\d{1,2})\)\s*$/, // "(01/21)"
    /\s*(\d{2})\/(\d{2})\s*$/, // "07/10", glued "16403/10"
  ];
  for (const p of patterns) {
    const m = p.exec(description);
    if (!m) continue;
    const number = Number(m[1]);
    const total = Number(m[2]);
    if (total >= 2 && number >= 1 && number <= total) {
      return { description: description.slice(0, m.index).trim(), installment: { number, total } };
    }
  }
  return { description: description.trim(), installment: null };
}

/** Items of a line inside [from, to) on the x axis. */
export function itemsBetween(line: PdfLine, from: number, to: number): PdfItem[] {
  return line.items.filter((i) => i.x >= from && i.x < to);
}

export type Column = { page: number; lines: { y: number; items: PdfItem[]; text: string }[] };

/**
 * Splits pages with side-by-side columns at `splitX` and returns the columns in
 * reading order: page 1 left, page 1 right, page 2 left, ...
 */
export function readingColumns(lines: PdfLine[], splitX: number): Column[] {
  const pages = [...new Set(lines.map((l) => l.page))];
  const out: Column[] = [];
  for (const page of pages) {
    for (const side of ['left', 'right'] as const) {
      const colLines = lines
        .filter((l) => l.page === page)
        .map((l) => {
          const items = l.items.filter((i) => (side === 'left' ? i.x < splitX : i.x >= splitX));
          return { y: l.y, items, text: items.map((i) => i.text).join(' ') };
        })
        .filter((l) => l.items.length);
      if (colLines.length) out.push({ page, lines: colLines });
    }
  }
  return out;
}

/**
 * `extra`: attached lines top to bottom; with attach "nearest", lines above the
 * anchor are prefixed with "^" so callers can put them before the anchor text.
 */
export type AnchoredRow<T> = { anchor: T; page: number; y: number; extra: string[] };

/** Anchor text with the wrapped lines around it, in reading order. */
export function joinAround(anchorText: string, extra: string[]): string {
  const above = extra.filter((e) => e.startsWith('^')).map((e) => e.slice(1));
  const below = extra.filter((e) => !e.startsWith('^'));
  return [...above, anchorText, ...below].filter(Boolean).join(' ');
}

/**
 * Rows whose description wraps around the line holding the date/amount (the
 * anchor). Non-anchor lines whose first item starts at one of `textXs` (±6) are
 * attached to the nearest anchor on the same page within `band`
 * ("nearest"), or to the previous anchor, even across pages ("above").
 */
export function anchoredRows<T>(
  lines: PdfLine[],
  anchorOf: (line: PdfLine) => T | null,
  options: { textXs: number[]; band: number; attach: 'nearest' | 'above'; stop?: (line: PdfLine) => boolean },
): AnchoredRow<T>[] {
  const rows: AnchoredRow<T>[] = [];
  const loose: PdfLine[] = [];
  for (const line of lines) {
    if (options.stop?.(line)) break;
    const anchor = anchorOf(line);
    if (anchor !== null) {
      rows.push({ anchor, page: line.page, y: line.y, extra: [] });
      continue;
    }
    const first = line.items[0];
    if (!first || !options.textXs.some((x) => Math.abs(first.x - x) <= 6)) continue;
    if (options.attach === 'above') {
      const prev = rows[rows.length - 1];
      if (prev) prev.extra.push(line.text);
    } else {
      loose.push(line);
    }
  }
  if (options.attach === 'nearest') {
    const attached = new Map<AnchoredRow<T>, PdfLine[]>();
    for (const line of loose) {
      let best: AnchoredRow<T> | null = null;
      for (const r of rows) {
        if (r.page !== line.page || Math.abs(r.y - line.y) > options.band) continue;
        if (!best || Math.abs(r.y - line.y) < Math.abs(best.y - line.y)) best = r;
      }
      if (best) attached.set(best, [...(attached.get(best) ?? []), line]);
    }
    for (const [row, extra] of attached) {
      // Reading order (top to bottom), anchor text placed by the caller.
      row.extra = extra.sort((a, b) => b.y - a.y).map((l) => (l.y > row.y ? `^${l.text}` : l.text));
    }
  }
  return rows;
}

/** Collapses spaces and trims; long bank texts are capped for the purchase description. */
export function cleanDescription(text: string, max = 255): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}
