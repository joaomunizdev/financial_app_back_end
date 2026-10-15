// Fixtures are synthetic: same layout as real bank files, made-up people and values.
import type { PdfLine } from './pdf-text';
import {
  addMonthsISO,
  inferYear,
  parseBRL,
  splitInstallment,
} from './parse-utils';
import {
  parseInterCsv,
  parseItauStatementPdf,
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
import {
  descriptionSignature,
  importKeys,
  keywordCategory,
  ownNamePatterns,
  pairCardFundedPix,
  suggestAction,
} from './suggestions';
import type { ParsedLine } from './types';

/** Builds a PDF line from [x, text] pairs. */
function L(page: number, y: number, ...items: [number, string][]): PdfLine {
  return {
    page,
    y,
    items: items.map(([x, text]) => ({ x, width: text.length * 4, text })),
    text: items.map(([, t]) => t).join(' '),
  };
}

const brief = (l: ParsedLine) =>
  `${l.date} ${l.direction === 'debit' ? '-' : '+'}${(l.amountCents / 100).toFixed(2)}${l.installment ? ` ${l.installment.number}/${l.installment.total}` : ''} ${l.description}`;

describe('parse utils', () => {
  it('reads Brazilian amounts in every printed form', () => {
    expect(parseBRL('1.234,56')).toBe(123456);
    expect(parseBRL('R$ -1.238,43')).toBe(-123843);
    expect(parseBRL('246,68-')).toBe(-24668);
    expect(parseBRL('−R$ 336,79')).toBe(-33679);
    expect(parseBRL('-R$ 3.750,65')).toBe(-375065);
    expect(parseBRL('+ 2.732,29')).toBe(273229);
    expect(parseBRL('Parcela 1 de 10')).toBeNull();
    expect(parseBRL('12/09')).toBeNull();
  });

  it('infers the year from the document date', () => {
    expect(inferYear(10, 9, '2026-09-28')).toBe('2026-09-10');
    expect(inferYear(15, 12, '2026-01-05')).toBe('2025-12-15');
    // Installment 11/12 in a September invoice was bought in November of the previous year.
    expect(inferYear(11, 11, '2026-09-30', 11)).toBe('2025-11-11');
    expect(inferYear(3, 3, '2026-09-28', 7)).toBe('2026-03-03');
  });

  it('splits installment markers from descriptions', () => {
    expect(splitInstallment('Amazon - Parcela 4/9')).toEqual({ description: 'Amazon', installment: { number: 4, total: 9 } });
    expect(splitInstallment('LOJA X Parcela 1 de 10').installment).toEqual({ number: 1, total: 10 });
    expect(splitInstallment('AMAZON BR SAO PAULO(01/21)')).toEqual({ description: 'AMAZON BR SAO PAULO', installment: { number: 1, total: 21 } });
    expect(splitInstallment('Loja Centro 16403/10')).toEqual({ description: 'Loja Centro 164', installment: { number: 3, total: 10 } });
    expect(splitInstallment('Loja 13/07').installment).toBeNull(); // not k/n (k > n)
    expect(splitInstallment('Mercado').installment).toBeNull();
  });

  it('adds months clamping the day', () => {
    expect(addMonthsISO('2026-08-31', -3)).toBe('2026-05-31');
    expect(addMonthsISO('2026-03-31', -1)).toBe('2026-02-28');
  });
});

describe('statement parsers', () => {
  it('reads OFX with open or closed leaf tags', () => {
    const ofx = `OFXHEADER:100\n<OFX><BANKACCTFROM><BANKID>0260</BANKID></BANKACCTFROM>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260901000000[-3:BRT]<TRNAMT>-112.00<FITID>abc-1<MEMO>Pix enviado - Fulano</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260902</DTPOSTED><TRNAMT>50.5</TRNAMT><FITID>abc-2</FITID><NAME>Salario</NAME></STMTTRN>`;
    const { bank, lines } = parseOfx(ofx);
    expect(bank).toBe('nubank');
    expect(lines.map(brief)).toEqual(['2026-09-01 -112.00 Pix enviado - Fulano', '2026-09-02 +50.50 Salario']);
    expect(lines[0].externalId).toBe('abc-1');
  });

  it('reads Nubank and Inter CSVs', () => {
    const nubank = 'Data,Valor,Identificador,Descrição\n01/09/2026,-12.50,id-1,"Compra, loja"\n02/09/2026,100.00,id-2,Recebido';
    expect(parseNubankCsv(nubank).map(brief)).toEqual(['2026-09-01 -12.50 Compra, loja', '2026-09-02 +100.00 Recebido']);
    const inter = ' Extrato Conta Corrente \nConta ;123\n\nData Lançamento;Histórico;Descrição;Valor;Saldo\n05/09/2026;Pix enviado;Fulano;-1.234,56;0,00\n';
    expect(parseInterCsv(inter).map(brief)).toEqual(['2026-09-05 -1234.56 Pix enviado - Fulano']);
  });

  it('reads Itaú statements and skips daily balances', () => {
    const lines = [
      L(1, 553, [31, '14/10/2026'], [96, 'PIX TRANSF Fulano14/10'], [424, '250,00']),
      L(1, 534, [31, '14/10/2026'], [96, 'FATURA PAGA Cartao'], [419, '-250,00']),
      L(1, 516, [31, '14/10/2026'], [96, 'SALDO DO DIA'], [542, '0,00']),
    ];
    expect(parseItauStatementPdf(lines).map(brief)).toEqual([
      '2026-10-14 +250.00 PIX TRANSF Fulano14/10',
      '2026-10-14 -250.00 FATURA PAGA Cartao',
    ]);
  });

  it('reads Mercado Pago statements with descriptions wrapped around the row', () => {
    const lines = [
      L(1, 410, [41, '01-09-2026'], [89, 'Rendimentos'], [197, '111'], [310, 'R$ 0,23'], [370, 'R$ 518,19']),
      L(1, 386, [89, 'Pix recebido Fulano']),
      L(1, 380, [41, '01-09-2026'], [197, '222'], [293, 'R$ 1.000,93'], [370, 'R$ 1.519,12']),
      L(1, 375, [89, 'de Tal']),
      L(1, 348, [41, '01-09-2026'], [89, 'Pagamento Cartão de crédito'], [197, '333'], [292, 'R$ -1.238,43'], [370, 'R$ 280,69']),
    ];
    expect(parseMercadoPagoStatementPdf(lines).map(brief)).toEqual([
      '2026-09-01 +0.23 Rendimentos',
      '2026-09-01 +1000.93 Pix recebido Fulano de Tal',
      '2026-09-01 -1238.43 Pagamento Cartão de crédito',
    ]);
  });

  it('reads the Santander movement table only, carrying the date and detail lines', () => {
    const lines = [
      L(1, 806, [503, 'setembro/2026']),
      L(2, 274, [34, 'Movimentação']),
      L(2, 252, [34, 'Data'], [65, 'Descrição'], [298, 'Nº Documento'], [409, 'Movimento (R$)'], [508, 'Saldo (R$)']),
      L(2, 241, [65, 'SALDO EM 31/08'], [513, '1.002,96']),
      L(2, 231, [34, '01/09'], [65, 'PIX ENVIADO'], [319, '-'], [433, '246,68-']),
      L(2, 222, [65, 'fulano de tal']),
      L(2, 203, [34, '02/09'], [65, 'PAGAMENTO DE BENEFICIOS'], [309, '000613'], [428, '4.199,78']),
      L(2, 184, [65, 'DEBITO VISA ELECTRON BRASIL'], [309, '140778'], [437, '20,00-']),
      L(2, 175, [65, '02/09 PADARIA']),
      L(3, 162, [65, 'SALDO EM 30/09'], [513, '1.737,59']),
      // Other tables after the closing balance repeat the same movements.
      L(4, 500, [34, '02/09'], [200, '4108.4904'], [250, 'PADARIA'], [470, '20,00']),
    ];
    expect(parseSantanderStatementPdf(lines).map(brief)).toEqual([
      '2026-09-01 -246.68 PIX ENVIADO - fulano de tal',
      '2026-09-02 +4199.78 PAGAMENTO DE BENEFICIOS',
      '2026-09-02 -20.00 DEBITO VISA ELECTRON BRASIL - 02/09 PADARIA',
    ]);
  });

  it('reads Nubank statement PDFs, signing by the entradas/saídas block', () => {
    const lines = [
      L(1, 561, [57, 'Movimentações']),
      L(1, 539, [58, '01 SET 2026'], [120, 'Total de entradas'], [493, '+ 100,00']),
      L(1, 518, [120, 'Transferência recebida pelo Pix'], [262, 'FULANO - BANCO X'], [503, '100,00']),
      L(1, 362, [120, 'Total de saídas'], [494, '- 50,00']),
      L(1, 341, [120, 'Transferência enviada pelo Pix'], [262, 'LOJA Y - 12.345'], [509, '50,00']),
      L(1, 321, [262, 'Agência: 1 Conta: 9']),
      L(2, 781, [409, 'Fulano de Tal']),
      L(2, 674, [262, 'continua da página anterior']),
    ];
    expect(parseNubankStatementPdf(lines).map(brief)).toEqual([
      '2026-09-01 +100.00 Transferência recebida pelo Pix - FULANO - BANCO X',
      '2026-09-01 -50.00 Transferência enviada pelo Pix - LOJA Y - 12.345 Agência: 1 Conta: 9 continua da página anterior',
    ]);
  });
});

describe('invoice parsers', () => {
  it('reads Itaú invoices column by column, only from charge sections', () => {
    const lines = [
      L(1, 661, [242, 'Emissão: 28/09/2026']),
      L(2, 719, [133, 'Pagamentos efetuados'], [351, 'Lançamentos: compras e saques']),
      L(2, 699, [133, '01/09'], [161, 'Pagamento via conta'], [305, '-1.223,58'], [351, '10/09'], [379, 'STREAMING X'], [533, '23,90']),
      L(2, 690, [379, 'outros CIDADE']),
      L(2, 617, [133, 'Lançamentos: compras e saques']),
      L(2, 584, [133, '03/03'], [161, 'LOJA GARAGEM 07/10'], [314, '79,00']),
      L(2, 415, [345, 'L Total dos lançamentos atuais'], [521, '102,90']),
      L(2, 387, [351, 'Compras parceladas - próximas faturas']),
      L(2, 367, [351, '03/03'], [379, 'LOJA GARAGEM 08/10'], [533, '79,00']),
      L(3, 762, [143, '06/06'], [170, 'OUTRA LOJA 05/05'], [318, '73,56']),
    ];
    const r = parseItauInvoicePdf(lines);
    expect(r.lines.map(brief)).toEqual(['2026-03-03 -79.00 7/10 LOJA GARAGEM', '2026-09-10 -23.90 STREAMING X']);
    expect(r.expectedTotalCents).toBe(10290);
  });

  it('reads Bradesco invoices (installments as "(01/21)")', () => {
    const lines = [
      L(1, 738, [50, 'Total da fatura'], [176, 'Vencimento']),
      L(1, 709, [47, 'R$ 157,63'], [173, '10/09/2026']),
      L(1, 400, [43, '(+) Compras/Débitos'], [129, 'R$ 157,63']),
      L(2, 776, [57, 'Lançamentos'], [313, 'Total parcelado para as próximas faturas']),
      L(2, 738, [49, '08/08'], [73, 'LOJA ONLINE'], [131, 'SAO PAULO(01/21)'], [269, '119,00'], [312, 'Demais faturas'], [517, 'R$ 2.646,90']),
      L(2, 728, [49, '11/08'], [73, 'MARKETPLACE*X Sao Paulo'], [272, '38,63']),
    ];
    const r = parseBradescoInvoicePdf(lines);
    expect(r.lines.map(brief)).toEqual(['2026-08-08 -119.00 1/21 LOJA ONLINE SAO PAULO', '2026-08-11 -38.63 MARKETPLACE*X Sao Paulo']);
    expect(r.expectedTotalCents).toBe(15763);
  });

  it('reads Mercado Pago invoices and treats the unsigned invoice payment as a credit', () => {
    const lines = [
      L(1, 776, [434, 'Emitida em: 30/09/2026']),
      L(2, 689, [40, 'Movimentações na fatura']),
      L(2, 614, [40, '01/09'], [94, 'Pagamento da fatura de setembro/2026'], [501, 'R$ 1.238,43']),
      L(2, 492, [40, '12/09'], [94, 'LOJA*ABC'], [395, 'Parcela 1 de 10'], [513, 'R$ 28,37']),
      L(2, 460, [40, '11/11'], [94, 'MARKETPLACE CC'], [392, 'Parcela 11 de 12'], [508, 'R$ 479,77']),
      L(2, 176, [40, 'Total'], [502, 'R$ 508,14']),
      L(3, 500, [40, '01/10'], [94, 'Depois do total'], [500, 'R$ 1,00']),
    ];
    const r = parseMercadoPagoInvoicePdf(lines);
    expect(r.lines.map(brief)).toEqual([
      '2026-09-01 +1238.43 Pagamento da fatura de setembro/2026',
      '2026-09-12 -28.37 1/10 LOJA*ABC',
      '2025-11-11 -479.77 11/12 MARKETPLACE CC',
    ]);
    expect(r.expectedTotalCents).toBe(50814);
  });

  it('reads Nubank invoices: card mask removed, wrapped names, installments dated back', () => {
    const lines = [
      L(3, 782, [327, 'FATURA 05 OUT 2026'], [443, 'EMISSÃO E ENVIO 27 SET 2026']),
      L(3, 734, [50, 'TRANSAÇÕES'], [130, 'DE 28 AGO A 27 SET']),
      L(3, 665, [123, '28 AGO'], [172, '•••• 1234'], [214, 'Loja Online - Parcela 4/9'], [501, 'R$ 43,13']),
      L(3, 643, [123, '13 SET'], [172, '•••• 1234'], [214, 'Mercadinho'], [501, 'R$ 46,14']),
      L(4, 256, [123, '01 SET'], [185, 'Pagamento em 01 SET'], [493, '−R$ 336,79']),
      L(6, 585, [185, 'RESTAURANTE ONLINE S A - Parcela']),
      L(6, 581, [123, '28 AGO'], [504, 'R$ 22,17']),
      L(6, 576, [185, '2/6']),
      L(6, 560, [201, 'Total a pagar: R$ 133,00 (valor da transação ...)']),
    ];
    expect(parseNubankInvoicePdf(lines).lines.map(brief)).toEqual([
      '2026-05-28 -43.13 4/9 Loja Online',
      '2026-09-13 -46.14 Mercadinho',
      '2026-09-01 +336.79 Pagamento em 01 SET',
      '2026-07-28 -22.17 2/6 RESTAURANTE ONLINE S A',
    ]);
  });
});

describe('suggestions', () => {
  const debit = (description: string): ParsedLine => ({ date: '2026-09-01', description, amountCents: 1000, direction: 'debit', installment: null });
  const credit = (description: string): ParsedLine => ({ ...debit(description), direction: 'credit' });
  const own = ownNamePatterns('Fulano Tal');

  it('skips invoice payments, own transfers, investments and loans on statements', () => {
    expect(suggestAction('statement', debit('Pagamento de fatura'), own).reason).toBe('card_payment');
    expect(suggestAction('statement', debit('FATURA PAGA Cartao X'), own).reason).toBe('card_payment');
    // Profile "Fulano Tal"; banks print the full name or cut it.
    expect(suggestAction('statement', debit('Pix enviado - FULANO BELTRANO DE TAL - •••.123'), own).reason).toBe('own_transfer');
    expect(suggestAction('statement', debit('PIX TRANSF Fulano Ta14/10'), own).reason).toBe('own_transfer');
    expect(suggestAction('statement', credit('Pix recebido Fulano Tal'), own).reason).toBe('own_transfer');
    expect(suggestAction('statement', debit('Pix enviado - Fulano Souza'), own).reason).toBeNull();
    expect(suggestAction('statement', credit('Rendimentos'), own).reason).toBe('investment');
    expect(suggestAction('statement', debit('Pagamento de parcela Empréstimos'), own).reason).toBe('loan');
    expect(suggestAction('statement', debit('Pix enviado - Padaria'), own)).toEqual({ action: 'purchase', reason: null });
    expect(suggestAction('statement', credit('REMUNERACAO/SALARIO'), own)).toEqual({ action: 'income', reason: null });
  });

  it('skips both sides of a Pix paid with the credit card', () => {
    const items = [
      credit('Valor adicionado na conta por cartão de crédito - Valor adicionado para Pix'),
      debit('Transferência enviada pelo Pix - SUPERMERCADO X'),
      debit('Transferência enviada pelo Pix - OUTRA LOJA'),
    ].map((line, i) => ({ line: i === 2 ? { ...line, amountCents: 999 } : line, ...suggestAction('statement', line, own) }));
    pairCardFundedPix(items);
    expect(items.map((i) => [i.action, i.reason])).toEqual([
      ['ignore', 'credit_card_pix'],
      ['ignore', 'credit_card_pix'],
      ['purchase', null],
    ]);
  });

  it('imports invoice charges and skips invoice credits', () => {
    expect(suggestAction('invoice', debit('Loja'), own).action).toBe('purchase');
    expect(suggestAction('invoice', credit('Estorno'), own)).toEqual({ action: 'ignore', reason: 'invoice_credit' });
  });

  it('gives one installment purchase the same key in every invoice', () => {
    const inst = (n: number): ParsedLine => ({ ...debit('Loja'), date: '2026-05-28', installment: { number: n, total: 9 } });
    expect(importKeys('nubank', 'invoice', [inst(4)])).toEqual(importKeys('nubank', 'invoice', [inst(5)]));
    const [a, b] = importKeys('itau', 'invoice', [debit('Cafe'), debit('Cafe')]);
    expect(a).not.toBe(b); // two identical lines in one file are two purchases
  });

  it('suggests categories by keyword', () => {
    expect(keywordCategory('IFD*ACAI COM CHANTILLY')).toBe('Alimentação');
    expect(keywordCategory('Slminimercados')).toBe('Mercado');
    expect(keywordCategory('EBN*SPOTIFY')).toBe('Assinaturas');
    expect(keywordCategory('XYZ LTDA')).toBeNull();
    expect(keywordCategory('Pix - LOJA - MERCADO PAGO IP LTDA')).toBeNull();
    expect(descriptionSignature('Transferência enviada pelo Pix - X')).toBe('');
    expect(descriptionSignature('IFOOD.COM AGENCIA')).toBe('ifood com');
  });
});
