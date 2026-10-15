import { createTenantReportPdf, monthLabel, reportTotals, TenantReportData } from './tenant-report-pdf';

const data = (entries = 3): TenantReportData => ({
  tenantName: 'Ana Souza',
  year: 2026,
  month: 9,
  generatedAt: new Date('2026-10-15T12:00:00Z'),
  entries: Array.from({ length: entries }, (_, i) => ({
    label: `Loja ${i}`,
    origin: i % 2 ? 'Pix' : 'Cartão Azul',
    kind: i === 0 ? ('subscription' as const) : ('purchase' as const),
    amountCents: 1000,
  })),
  incomes: [{ description: 'Salário', amountCents: 500000 }],
  fixedExpenses: [{ description: 'Aluguel', amountCents: 150000 }],
});

function render(d: TenantReportData): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = createTenantReportPdf(d);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('tenant report PDF', () => {
  it('computes the month totals and a signed balance', () => {
    expect(reportTotals(data())).toEqual({
      purchases: 2000,
      subscriptions: 1000,
      fixed: 150000,
      income: 500000,
      expenses: 153000,
      balance: 347000,
    });
    expect(reportTotals({ ...data(), incomes: [] }).balance).toBe(-153000);
  });

  it('names the month in Portuguese', () => {
    expect(monthLabel(2026, 9)).toBe('setembro de 2026');
    expect(monthLabel(2026, 12)).toBe('dezembro de 2026');
  });

  it('renders a PDF and breaks long tables into more pages', async () => {
    const short = await render(data(3));
    expect(short.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(short)).toBe(1);
    expect(pageCount(await render(data(80)))).toBeGreaterThan(2);
  });

  it('renders a month without entries', async () => {
    const pdf = await render({ ...data(0), incomes: [], fixedExpenses: [] });
    expect(pageCount(pdf)).toBe(1);
  });
});
