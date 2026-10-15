export type ImportKind = 'statement' | 'invoice';
export type ImportFormat = 'ofx' | 'csv' | 'pdf';

export type BankId =
  | 'itau'
  | 'nubank'
  | 'mercadopago'
  | 'santander'
  | 'bradesco'
  | 'inter'
  | 'c6'
  | 'other';

export const BANK_NAMES: Record<BankId, string> = {
  itau: 'Itaú',
  nubank: 'Nubank',
  mercadopago: 'Mercado Pago',
  santander: 'Santander',
  bradesco: 'Bradesco',
  inter: 'Inter',
  c6: 'C6 Bank',
  other: 'Outro banco',
};

/** One movement read from a file. Amounts are positive cents; `direction` carries the sign. */
export type ParsedLine = {
  /** YYYY-MM-DD. For installments this is the original purchase date. */
  date: string;
  description: string;
  amountCents: number;
  /** debit = money out / charge; credit = money in / refund / payment. */
  direction: 'debit' | 'credit';
  /** Installment k of n (amountCents is the installment's amount). */
  installment: { number: number; total: number } | null;
  /** Stable id given by the bank (OFX FITID, Nubank CSV id). */
  externalId?: string;
};

export type ParseResult = {
  kind: ImportKind;
  bank: BankId;
  format: ImportFormat;
  lines: ParsedLine[];
  /** Total the document states for the imported charges, to cross-check the reading. */
  expectedTotalCents?: number;
  warnings: string[];
};

export class ImportFormatError extends Error {}
