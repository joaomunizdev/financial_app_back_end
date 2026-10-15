import { pdfLines } from './pdf-text';
import { norm } from './parse-utils';
import {
  parseItauStatementPdf,
  parseInterCsv,
  parseMercadoPagoStatementPdf,
  parseNubankCsv,
  parseNubankStatementPdf,
  parseOfx,
  parseSantanderStatementPdf,
} from './statement-parsers';
import {
  parseBradescoInvoicePdf,
  parseItauInvoicePdf,
  parseMercadoPagoInvoicePdf,
  parseNubankInvoicePdf,
} from './invoice-parsers';
import { BANK_NAMES, ImportFormatError, ImportKind, ParseResult } from './types';

/** Text files: UTF-8 unless the OFX header declares a Windows/Latin-1 charset. */
function decodeText(buffer: Buffer): string {
  const head = buffer.subarray(0, 400).toString('latin1');
  if (/CHARSET:\s*(1252|ISO-?8859-?1)/i.test(head)) return buffer.toString('latin1');
  return buffer.toString('utf8').replace(/^﻿/, '');
}

const isPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-';

/**
 * Reads a bank statement or credit card invoice, picking the parser from the
 * file content (not its name). Throws ImportFormatError for unknown or
 * unsupported layouts.
 */
export async function parseImportFile(buffer: Buffer, kind: ImportKind): Promise<ParseResult> {
  if (isPdf(buffer)) return parsePdf(buffer, kind);

  const text = decodeText(buffer);
  if (/<OFX>|OFXHEADER/i.test(text.slice(0, 2000))) {
    const { bank, lines } = parseOfx(text);
    return { kind, bank, format: 'ofx', lines, warnings: [] };
  }
  const firstLine = norm(text.split(/\r?\n/)[0] ?? '');
  if (firstLine === 'data,valor,identificador,descricao') {
    if (kind === 'invoice') throw new ImportFormatError('This file is a bank statement, not a credit card invoice');
    return { kind, bank: 'nubank', format: 'csv', lines: parseNubankCsv(text), warnings: [] };
  }
  if (firstLine === 'date,title,amount') {
    throw new ImportFormatError('Nubank credit card CSV is not supported yet; use the invoice PDF');
  }
  if (/extrato conta corrente/.test(firstLine) && /data lancamento;/.test(norm(text))) {
    if (kind === 'invoice') throw new ImportFormatError('This file is a bank statement, not a credit card invoice');
    return { kind, bank: 'inter', format: 'csv', lines: parseInterCsv(text), warnings: [] };
  }
  throw new ImportFormatError('Unrecognized file');
}

async function parsePdf(buffer: Buffer, kind: ImportKind): Promise<ParseResult> {
  const lines = await pdfLines(buffer);
  const all = norm(lines.map((l) => l.text).join('\n'));
  const statement = (bank: ParseResult['bank'], parsed: ParseResult['lines']): ParseResult => ({
    kind,
    bank,
    format: 'pdf',
    lines: parsed,
    warnings: [],
  });

  // --- Credit card invoices ---
  const invoice =
    /lancamentos: compras e saques/.test(all) && /itau/.test(all)
      ? { bank: 'itau' as const, parse: parseItauInvoicePdf }
      : /bradescard|bradesco cartoes/.test(all) && /lancamentos/.test(all)
        ? { bank: 'bradesco' as const, parse: parseBradescoInvoicePdf }
        : /movimentacoes na fatura/.test(all) && /mercado pago/.test(all)
          ? { bank: 'mercadopago' as const, parse: parseMercadoPagoInvoicePdf }
          : /emissao e envio \d{2} [a-z]{3} \d{4}/.test(all) && /transacoes/.test(all)
            ? { bank: 'nubank' as const, parse: parseNubankInvoicePdf }
            : null;

  // --- Bank statements ---
  const statementParser =
    /extrato conta \/ lancamentos/.test(all)
      ? { bank: 'itau' as const, parse: parseItauStatementPdf }
      : /extrato de conta/.test(all) && /mercado pago/.test(all)
        ? { bank: 'mercadopago' as const, parse: parseMercadoPagoStatementPdf }
        : /extrato consolidado inteligente/.test(all)
          ? { bank: 'santander' as const, parse: parseSantanderStatementPdf }
          : /movimentacoes/.test(all) && /total de (entradas|saidas)|saldo final do periodo/.test(all) && /nu pagamentos|nubank|ouvidoria do nu|4020 0185/.test(all)
            ? { bank: 'nubank' as const, parse: parseNubankStatementPdf }
            : null;

  if (kind === 'invoice') {
    if (invoice) {
      const { lines: parsed, expectedTotalCents } = invoice.parse(lines);
      return { kind, bank: invoice.bank, format: 'pdf', lines: parsed, expectedTotalCents, warnings: [] };
    }
    if (statementParser) throw new ImportFormatError('This file is a bank statement, not a credit card invoice');
  } else {
    if (statementParser) return statement(statementParser.bank, statementParser.parse(lines));
    if (invoice) throw new ImportFormatError('This file is a credit card invoice, not a bank statement');
  }

  // Known layouts without a parser yet (no sample with transactions).
  if (/c6 bank|ouvidoria.*0800 660 6060/.test(all)) {
    throw new ImportFormatError(`${BANK_NAMES.c6} PDF is not supported yet; export the statement as OFX`);
  }
  if (/banco inter|instituicao: banco inter/.test(all)) {
    throw new ImportFormatError(`${BANK_NAMES.inter} PDF is not supported yet; export the statement as OFX or CSV`);
  }
  throw new ImportFormatError('Unrecognized file');
}
