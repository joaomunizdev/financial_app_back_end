import type { PdfLine } from './pdf-text';
import {
  anchoredRows,
  cleanDescription,
  isoDate,
  joinAround,
  monthFromName,
  norm,
  parseBRL,
  parseDecimal,
  parseFullDate,
} from './parse-utils';
import { BankId, ImportFormatError, ParsedLine } from './types';

const line = (
  date: string,
  description: string,
  signedCents: number,
  externalId?: string,
): ParsedLine => ({
  date,
  description: cleanDescription(description),
  amountCents: Math.abs(signedCents),
  direction: signedCents < 0 ? 'debit' : 'credit',
  installment: null,
  ...(externalId ? { externalId } : {}),
});

// ---------------------------------------------------------------------------
// OFX (any bank). SGML leaf tags may or may not be closed.
// ---------------------------------------------------------------------------

const OFX_BANKS: Record<string, BankId> = {
  '077': 'inter',
  '0077': 'inter',
  '260': 'nubank',
  '0260': 'nubank',
  '341': 'itau',
  '0341': 'itau',
  '033': 'santander',
  '0033': 'santander',
  '237': 'bradesco',
  '0237': 'bradesco',
  '336': 'c6',
  '0336': 'c6',
  '323': 'mercadopago',
  '0323': 'mercadopago',
};

function ofxTag(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block);
  return m ? m[1].trim() : null;
}

export function parseOfx(text: string): { bank: BankId; lines: ParsedLine[] } {
  const bankId = ofxTag(text, 'BANKID') ?? ofxTag(text, 'FID') ?? '';
  const bank = OFX_BANKS[bankId] ?? 'other';
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const lines: ParsedLine[] = [];
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const cents = parseDecimal(ofxTag(block, 'TRNAMT') ?? '');
    const posted = ofxTag(block, 'DTPOSTED') ?? '';
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(posted);
    if (cents === null || !m || cents === 0) continue;
    const description = [ofxTag(block, 'MEMO'), ofxTag(block, 'NAME')]
      .filter((v): v is string => !!v)
      .filter((v, i, all) => all.indexOf(v) === i)
      .join(' - ');
    lines.push(
      line(`${m[1]}-${m[2]}-${m[3]}`, description || 'Lançamento', cents, ofxTag(block, 'FITID') ?? undefined),
    );
  }
  return { bank, lines };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Splits one CSV row honoring double quotes. */
export function csvRow(row: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (quoted && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Nubank account CSV: "Data,Valor,Identificador,Descrição". */
export function parseNubankCsv(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/).filter((r) => r.trim());
  const out: ParsedLine[] = [];
  for (const row of rows.slice(1)) {
    const [date, value, id, ...desc] = csvRow(row, ',');
    const iso = parseFullDate(date);
    const cents = parseDecimal(value);
    if (!iso || cents === null || cents === 0) continue;
    out.push(line(iso, desc.join(', '), cents, id || undefined));
  }
  return out;
}

/** Inter account CSV: header block, then "Data Lançamento;Histórico;Descrição;Valor;Saldo". */
export function parseInterCsv(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/);
  const header = rows.findIndex((r) => norm(r).startsWith('data lancamento;'));
  if (header < 0) throw new ImportFormatError('Inter CSV header not found');
  const out: ParsedLine[] = [];
  for (const row of rows.slice(header + 1)) {
    if (!row.trim()) continue;
    const [date, history, description, value] = csvRow(row, ';');
    const iso = parseFullDate(date);
    const cents = parseBRL(value ?? '');
    if (!iso || cents === null || cents === 0) continue;
    out.push(line(iso, [history, description].filter(Boolean).join(' - '), cents));
  }
  return out;
}

// ---------------------------------------------------------------------------
// PDF statements
// ---------------------------------------------------------------------------

/** Itaú: "dd/mm/yyyy | lançamento | valor | saldo"; daily balance rows are skipped. */
export function parseItauStatementPdf(lines: PdfLine[]): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const l of lines) {
    const date = parseFullDate(l.items[0]?.text ?? '');
    if (!date || l.items[0].x > 60) continue;
    const desc = l.items.filter((i) => i.x > 60 && i.x < 350).map((i) => i.text).join(' ');
    if (!desc || /^saldo (do dia|anterior)/.test(norm(desc))) continue;
    const valueItem = l.items.find((i) => i.x >= 350 && i.x < 500 && parseBRL(i.text) !== null);
    if (!valueItem) continue;
    out.push(line(date, desc, parseBRL(valueItem.text)!));
  }
  return out;
}

/** Mercado Pago: "dd-mm-yyyy | descrição (wraps above/below) | ID | valor | saldo". */
export function parseMercadoPagoStatementPdf(lines: PdfLine[]): ParsedLine[] {
  const rows = anchoredRows(
    lines,
    (l) => {
      const date = parseFullDate(l.items[0]?.text ?? '');
      const value = l.items.find((i) => i.x >= 240 && i.x < 345 && parseBRL(i.text) !== null);
      if (!date || !value || l.items[0].x > 60) return null;
      const desc = l.items.filter((i) => i.x > 60 && i.x < 190).map((i) => i.text).join(' ');
      const id = l.items.find((i) => i.x >= 190 && i.x < 240 && /^\d+$/.test(i.text))?.text;
      return { date, cents: parseBRL(value.text)!, desc, id };
    },
    { textXs: [89], band: 9, attach: 'nearest' },
  );
  return rows.map((r) =>
    line(
      r.anchor.date,
      joinAround(r.anchor.desc, r.extra),
      r.anchor.cents,
      r.anchor.id ? `mp-${r.anchor.id}` : undefined,
    ),
  );
}

/**
 * Santander "Extrato consolidado inteligente": only the "Movimentação" table.
 * The date is printed on the first row of each day; debits end with "-"; each
 * row may have a detail line below (counterparty / merchant).
 */
export function parseSantanderStatementPdf(lines: PdfLine[]): ParsedLine[] {
  const header = lines.find((l) => /^[a-zç]+\/\d{4}$/i.test(norm(l.text)));
  const hm = header ? /^([a-zç]+)\/(\d{4})$/i.exec(norm(header.text)) : null;
  const refMonth = hm ? monthFromName(hm[1]) : null;
  const refYear = hm ? Number(hm[2]) : null;
  if (!refMonth || !refYear) throw new ImportFormatError('Santander statement month not found');

  const start = lines.findIndex((l) => norm(l.text) === 'movimentacao');
  if (start < 0) return [];
  const body = lines.slice(start + 1);
  let saldoSeen = 0;
  let currentDay: string | null = null;
  const rows = anchoredRows(
    body,
    (l) => {
      const first = l.items[0];
      if (first && first.x < 60 && /^\d{2}\/\d{2}$/.test(first.text)) {
        const [d, m] = first.text.split('/').map(Number);
        currentDay = isoDate(m > refMonth ? refYear - 1 : refYear, m, d);
      }
      const value = l.items.find((i) => i.x >= 380 && i.x < 490 && parseBRL(i.text) !== null);
      const desc = l.items.filter((i) => i.x >= 60 && i.x < 290).map((i) => i.text).join(' ');
      if (!value || !desc || !currentDay) return null;
      return { date: currentDay, cents: parseBRL(value.text)!, desc };
    },
    {
      textXs: [65],
      band: 12,
      attach: 'above',
      // The table ends at the second "SALDO EM dd/mm" (closing balance).
      stop: (l) => /^saldo em \d{2}\/\d{2}/.test(norm(l.items.find((i) => i.x >= 60)?.text ?? '')) && ++saldoSeen > 1,
    },
  );
  return rows
    .filter((r) => !/^saldo em/.test(norm(r.anchor.desc)))
    .map((r) =>
      line(
        r.anchor.date,
        [r.anchor.desc, ...r.extra.filter((e) => !/^saldo em/.test(norm(e)))].join(' - '),
        r.anchor.cents,
      ),
    );
}

/**
 * Nubank account PDF: days ("01 SET 2026") split in "Total de entradas" /
 * "Total de saídas" blocks with unsigned amounts; counterparty text wraps below.
 */
export function parseNubankStatementPdf(lines: PdfLine[]): ParsedLine[] {
  let day: string | null = null;
  let direction: 1 | -1 = 1;
  const start = lines.findIndex((l) => norm(l.text) === 'movimentacoes');
  const rows = anchoredRows(
    start >= 0 ? lines.slice(start + 1) : lines,
    (l) => {
      for (const it of l.items) {
        const dm = /^(\d{2}) ([A-Za-z]{3}) (\d{4})$/.exec(it.text);
        const month = dm ? monthFromName(dm[2]) : null;
        if (dm && month && it.x < 100) day = isoDate(Number(dm[3]), month, Number(dm[1]));
        const t = norm(it.text);
        if (t === 'total de entradas') direction = 1;
        if (t === 'total de saidas') direction = -1;
      }
      if (l.items.some((i) => norm(i.text).startsWith('total de'))) return null;
      const value = l.items[l.items.length - 1];
      const cents = value && value.x > 450 ? parseBRL(value.text) : null;
      const kind = l.items.find((i) => i.x >= 100 && i.x < 250);
      if (!day || cents === null || !kind) return null;
      const counterpart = l.items.filter((i) => i.x >= 250 && i !== value).map((i) => i.text).join(' ');
      return { date: day, cents: direction * Math.abs(cents), desc: [kind.text, counterpart].filter(Boolean).join(' - ') };
    },
    { textXs: [261, 262], band: 30, attach: 'above' },
  );
  return rows.map((r) => line(r.anchor.date, [r.anchor.desc, ...r.extra].join(' '), r.anchor.cents));
}
