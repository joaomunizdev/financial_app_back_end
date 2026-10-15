import type { PdfItem, PdfLine } from './pdf-text';
import {
  addMonthsISO,
  anchoredRows,
  cleanDescription,
  inferYear,
  isoDate,
  joinAround,
  monthFromName,
  norm,
  parseBRL,
  parseFullDate,
  readingColumns,
  splitInstallment,
} from './parse-utils';
import { ImportFormatError, ParsedLine } from './types';

/**
 * How the bank dates installment lines: at the original purchase ("original",
 * Itaú, Bradesco, Mercado Pago) or at this invoice's charge ("posting", Nubank).
 */
type InstallmentDating = 'original' | 'posting';

/** Lines of an invoice and, when printed, the total of its charges (to cross-check). */
export type InvoiceParse = { lines: ParsedLine[]; expectedTotalCents?: number };

function toLine(
  day: number,
  month: number,
  rawDescription: string,
  signedCents: number,
  reference: string,
  dating: InstallmentDating,
): ParsedLine {
  const { description, installment } = splitInstallment(rawDescription);
  let date: string;
  if (installment && dating === 'posting') {
    date = addMonthsISO(inferYear(day, month, reference), -(installment.number - 1));
  } else {
    date = inferYear(day, month, reference, installment?.number);
  }
  return {
    date,
    description: cleanDescription(description || rawDescription),
    amountCents: Math.abs(signedCents),
    // On invoices a positive amount is a charge; negatives and payments of the
    // invoice (some banks print them unsigned) are credits.
    direction: signedCents < 0 || /^pagamento\b/.test(norm(description)) ? 'credit' : 'debit',
    installment,
  };
}

function findDate(lines: PdfLine[], label: RegExp): string | null {
  for (const l of lines) {
    if (!label.test(norm(l.text))) continue;
    const m = /(\d{2}\/\d{2}\/\d{4})/.exec(l.text);
    if (m) return parseFullDate(m[1]);
  }
  return null;
}

function amountAfter(lines: PdfLine[], label: RegExp): number | undefined {
  for (const l of lines) {
    const idx = l.items.findIndex((i) => label.test(norm(i.text)));
    if (idx < 0) continue;
    for (const it of l.items.slice(idx)) {
      const cents = parseBRL(it.text);
      if (cents !== null) return Math.abs(cents);
    }
  }
  return undefined;
}

/** "dd/mm" first item and an amount last item → row parts. */
function columnRow(items: PdfItem[]) {
  const first = items[0];
  const last = items[items.length - 1];
  const dm = first && /^(\d{2})\/(\d{2})$/.exec(first.text);
  const cents = last && items.length >= 3 ? parseBRL(last.text) : null;
  if (!dm || cents === null) return null;
  const description = items.slice(1, -1).map((i) => i.text).join(' ');
  return { day: Number(dm[1]), month: Number(dm[2]), description, cents };
}

// ---------------------------------------------------------------------------
// Itaú (also Magalu/Luiza cards issued by Itaú): two columns, sections.
// ---------------------------------------------------------------------------

const ITAU_INCLUDE = [/^lancamentos: compras e saques/, /^lancamentos: produtos e servicos/, /^lancamentos internacionais/];
const ITAU_EXCLUDE = [/^pagamentos efetuados/, /^compras parceladas/, /^encargos/, /^limites de credito/, /^saldo financiado/];

export function parseItauInvoicePdf(lines: PdfLine[]): InvoiceParse {
  const reference = findDate(lines, /^emissao:|^postagem:/) ?? findDate(lines, /vencimento:/);
  if (!reference) throw new ImportFormatError('Itaú invoice date not found');
  const out: ParsedLine[] = [];
  let include = false;
  for (const col of readingColumns(lines, 335)) {
    for (const l of col.lines) {
      const t = norm(l.text);
      if (ITAU_INCLUDE.some((r) => r.test(t))) include = true;
      else if (ITAU_EXCLUDE.some((r) => r.test(t))) include = false;
      if (!include) continue;
      const row = columnRow(l.items);
      if (row) out.push(toLine(row.day, row.month, row.description, row.cents, reference, 'original'));
    }
  }
  return { lines: out, expectedTotalCents: amountAfter(lines, /total dos lancamentos atuais/) };
}

// ---------------------------------------------------------------------------
// Bradesco / Bradescard (e.g. Amazon): "Lançamentos" on the left column.
// ---------------------------------------------------------------------------

export function parseBradescoInvoicePdf(lines: PdfLine[]): InvoiceParse {
  const dueIndex = lines.findIndex((l) => l.items.some((i) => norm(i.text) === 'vencimento'));
  const due = dueIndex >= 0 ? lines.slice(dueIndex, dueIndex + 3).map((l) => /(\d{2}\/\d{2}\/\d{4})/.exec(l.text)?.[1]).find(Boolean) : null;
  const reference = due ? parseFullDate(due) : null;
  if (!reference) throw new ImportFormatError('Bradesco invoice due date not found');
  const out: ParsedLine[] = [];
  let include = false;
  for (const col of readingColumns(lines, 300)) {
    for (const l of col.lines) {
      const t = norm(l.text);
      if (/^lancamentos$/.test(t)) include = true;
      else if (/^total parcelado|^limites|^resumo dos encargos|^total da fatura/.test(t)) include = false;
      if (!include) continue;
      const row = columnRow(l.items);
      if (row) out.push(toLine(row.day, row.month, row.description, row.cents, reference, 'original'));
    }
  }
  return { lines: out, expectedTotalCents: amountAfter(lines, /^\(\+\) compras\/debitos/) };
}

// ---------------------------------------------------------------------------
// Mercado Pago: "Movimentações na fatura" until the "Total" row.
// ---------------------------------------------------------------------------

export function parseMercadoPagoInvoicePdf(lines: PdfLine[]): InvoiceParse {
  const reference = findDate(lines, /emitida em/) ?? findDate(lines, /vencimento/);
  if (!reference) throw new ImportFormatError('Mercado Pago invoice date not found');
  const start = lines.findIndex((l) => norm(l.text) === 'movimentacoes na fatura');
  if (start < 0) return { lines: [] };
  const out: ParsedLine[] = [];
  let expectedTotalCents: number | undefined;
  for (const l of lines.slice(start + 1)) {
    if (norm(l.items[0]?.text ?? '') === 'total') {
      expectedTotalCents = Math.abs(parseBRL(l.items[l.items.length - 1].text) ?? 0) || undefined;
      break;
    }
    const row = columnRow(l.items);
    if (row) out.push(toLine(row.day, row.month, row.description, row.cents, reference, 'original'));
  }
  return { lines: out, expectedTotalCents };
}

// ---------------------------------------------------------------------------
// Nubank: "28 AGO •••• 1234 Loja - Parcela 4/9  R$ 43,13"; long names wrap
// above/below the date line; installments are dated at this invoice's charge.
// ---------------------------------------------------------------------------

export function parseNubankInvoicePdf(lines: PdfLine[]): InvoiceParse {
  const issued = lines
    .map((l) => /emissao e envio (\d{2}) ([a-z]{3}) (\d{4})/.exec(norm(l.text)))
    .find(Boolean);
  const month = issued ? monthFromName(issued[2]) : null;
  if (!issued || !month) throw new ImportFormatError('Nubank invoice date not found');
  const reference = isoDate(Number(issued[3]), month, Number(issued[1]));

  const rows = anchoredRows(
    lines,
    (l) => {
      const first = l.items[0];
      const dm = first && first.x < 140 ? /^(\d{2}) ([A-Za-z]{3})$/.exec(first.text) : null;
      const m = dm ? monthFromName(dm[2]) : null;
      const last = l.items[l.items.length - 1];
      const cents = last && last.x > 450 ? parseBRL(last.text) : null;
      if (!dm || !m || cents === null || l.items.length < 2) return null;
      const description = l.items
        .slice(1, -1)
        .map((i) => i.text)
        .filter((t) => !/^•+ ?\d{4}$/.test(t))
        .join(' ');
      return { day: Number(dm[1]), month: m, description, cents };
    },
    { textXs: [185, 214], band: 6, attach: 'nearest' },
  );
  return {
    lines: rows.map((r) =>
      toLine(r.anchor.day, r.anchor.month, joinAround(r.anchor.description, r.extra), r.anchor.cents, reference, 'posting'),
    ),
  };
}
