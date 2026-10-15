import { createHash } from 'crypto';
import { norm } from './parse-utils';
import type { BankId, ImportKind, ParsedLine } from './types';

export type IgnoreReason =
  | 'card_payment'
  | 'own_transfer'
  | 'investment'
  | 'loan'
  | 'invoice_credit'
  | 'credit_card_pix';

const CARD_PAYMENT = /fatura|pagamento (de |do )?cart[a-z]* de credito|cartao luiza|realize|banco ibi|bradescard|luizacred|itaucard/;
const INVESTMENT = /rendimento|remuneracao aplicacao|aplicacao|resgate|\bcdb\b|tesouro direto/;
const LOAN = /emprestimo|credito pessoal|pagamento de parcela/;
/** Money put in the account by the credit card to pay a Pix ("Pix no crédito"). */
const CARD_FUNDED = /valor adicionado .*cartao de credito|pix no credito/;

/**
 * Patterns of the account holder's name as banks print it: the profile name's
 * words in order with up to 3 words between them ("ana souza" matches "ana
 * maria souza lima"), plus the "first name + 2 letters" cut ("ana ma").
 */
export function ownNamePatterns(fullName: string): RegExp[] {
  const parts = norm(fullName).replace(/[^a-z ]/g, '').split(' ').filter((p) => p.length > 1);
  if (parts.length < 2) return [];
  const inOrder = new RegExp(`\\b${parts.join('(?: [a-z.]+){0,3} ')}\\b`);
  return [inOrder, new RegExp(`\\b${parts[0]} ${parts[1].slice(0, 2)}`)];
}

/**
 * Default action for a line: invoices import charges and skip credits; bank
 * statements import debits as purchases and credits as income, except invoice
 * payments, transfers between the user's own accounts, investments and loans.
 */
export function suggestAction(
  kind: ImportKind,
  line: ParsedLine,
  ownNames: RegExp[],
): { action: 'purchase' | 'income' | 'ignore'; reason: IgnoreReason | null } {
  const d = norm(line.description);
  if (kind === 'invoice') {
    return line.direction === 'debit'
      ? { action: 'purchase', reason: null }
      : { action: 'ignore', reason: 'invoice_credit' };
  }
  if (line.direction === 'credit' && CARD_FUNDED.test(d)) return { action: 'ignore', reason: 'credit_card_pix' };
  if (CARD_PAYMENT.test(d)) return { action: 'ignore', reason: 'card_payment' };
  if (ownNames.some((re) => re.test(d))) return { action: 'ignore', reason: 'own_transfer' };
  if (INVESTMENT.test(d)) return { action: 'ignore', reason: 'investment' };
  if (LOAN.test(d)) return { action: 'ignore', reason: 'loan' };
  return { action: line.direction === 'debit' ? 'purchase' : 'income', reason: null };
}

/** Signatures that say nothing about what was bought (bank transfer labels). */
const GENERIC_SIGNATURES = /^(transferencia|pix|ted|doc|pagamento|debito|compra|deposito|saque|valor)\b/;

/**
 * Key words of a description used to learn categories ("IFOOD.COM AGENCIA" →
 * "ifood com"); empty for generic transfer labels.
 */
export function descriptionSignature(description: string): string {
  const sig = norm(description)
    .replace(/[^a-z ]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1)
    .slice(0, 2)
    .join(' ');
  return GENERIC_SIGNATURES.test(sig) ? '' : sig;
}

/** Keywords → default category name, used when the user's history has no match. */
const KEYWORDS: [RegExp, string][] = [
  [/ifood|restaurante|lanche|burguer|burger|pizza|acai|sushi|padaria|cafe|bar\b|rockbar|madrugadao|kyoto|chopp/, 'Alimentação'],
  [/supermerc|minimercado|mercadinho|\bmercado\b(?! pago| livre|livre)|prezunic|sacolao|hortifruti|atacad|assai|carrefour|guanabara/, 'Mercado'],
  [/uber|99 ?app|99 - nupay|posto|combust|estacion|parker|tag ?itau|recarga|metro|onibus|shell|ipiranga/, 'Transporte'],
  [/spotify|netflix|prime|amazon ?prime|apple\.com|google one|xbox|microsoft|hbo|disney|youtube|deezer|globoplay|assiny/, 'Assinaturas'],
  [/drogaria|farmacia|raia|pacheco|drogasil|hospital|clinica|laborat|odonto/, 'Saúde'],
  [/renner|riachuelo|\bc ?& ?a\b|cea |centauro|zara|shein|netshoes|calcad/, 'Vestuário'],
  [/kabum|cellairis|magazine luiza|magalu|eletro|samsung|apple store/, 'Eletrônicos'],
  [/claro|vivo|tim\b|oi fibra|light|enel|cedae|naturgy|net servicos|anuidade|envio mens|seguro/, 'Contas e serviços'],
  [/cinema|ingresso|teatro|show|sympla/, 'Cultura'],
  [/boticario|oboticario|natura|barbearia|salao|cabelo/, 'Cuidados pessoais'],
  [/airbnb|hotel|booking|latam|gol linhas|azul linhas|decolar/, 'Viagem'],
  [/petz|cobasi|petshop|veterin/, 'Pets'],
];

export function keywordCategory(description: string): string | null {
  const d = norm(description);
  return KEYWORDS.find(([re]) => re.test(d))?.[1] ?? null;
}

/**
 * Stable key of an imported line. Installments use the original purchase date
 * and count, so the same purchase in next month's invoice gets the same key;
 * identical lines in one file are told apart by their occurrence.
 */
export function importKeys(bank: BankId, kind: ImportKind, lines: ParsedLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const base = l.externalId
      ? `id|${l.externalId}`
      : l.installment
        ? `inst|${l.date}|${l.installment.total}|${l.amountCents}|${norm(l.description)}`
        : `${l.date}|${l.direction}|${l.amountCents}|${norm(l.description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    // No installment number in the key: "4/9" now and "5/9" next month are one purchase.
    const raw = `${bank}|${kind}|${base}|#${n}`;
    return `${bank}:${createHash('sha1').update(raw).digest('hex')}`;
  });
}

/**
 * "Pix no crédito": the card puts money in the account and a Pix of the same
 * amount leaves on the same day; the purchase is charged on the card invoice,
 * so that Pix is skipped too (it would count twice).
 */
export function pairCardFundedPix<T extends { line: ParsedLine; action: string; reason: string | null }>(items: T[]): void {
  const used = new Set<T>();
  for (const funded of items.filter((i) => i.reason === 'credit_card_pix')) {
    const pix = items.find(
      (i) =>
        !used.has(i) &&
        i.line.direction === 'debit' &&
        i.action !== 'ignore' &&
        i.line.date === funded.line.date &&
        i.line.amountCents === funded.line.amountCents,
    );
    if (pix) {
      used.add(pix);
      pix.action = 'ignore';
      pix.reason = 'credit_card_pix';
    }
  }
}
