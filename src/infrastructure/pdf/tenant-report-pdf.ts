import * as path from 'path';
import PDFDocument = require('pdfkit');

// Resolves to src/assets (ts-node) or dist/assets (build copies assets, see nest-cli.json)
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const FONT_REGULAR = path.join(ASSETS, 'fonts', 'Inter-Regular.ttf');
const FONT_SEMIBOLD = path.join(ASSETS, 'fonts', 'Inter-SemiBold.ttf');
const LOGO_MARK = path.join(ASSETS, 'mail', 'logo-mark.png');

// Design-system tokens (frontend lightMinimal theme / .superdesign/design-system.md).
const C = {
  text: '#18181B',
  secondary: '#52525B',
  muted: '#71717A',
  border: '#E4E4E7',
  subtle: '#F4F4F5',
  primary: '#4F46E5',
  primarySubtle: '#EEF2FF',
  positive: '#047857',
  negative: '#DC2626',
};

export type TenantReportEntry = {
  label: string;
  /** Card nickname, "Pix" or "Dinheiro". */
  origin: string;
  kind: 'purchase' | 'subscription';
  amountCents: number;
};

export type TenantReportData = {
  tenantName: string;
  year: number;
  month: number;
  generatedAt: Date;
  entries: TenantReportEntry[];
  incomes: { description: string; amountCents: number }[];
  fixedExpenses: { description: string; amountCents: number }[];
};

export function reportTotals(data: TenantReportData) {
  const sum = (xs: { amountCents: number }[]) => xs.reduce((s, x) => s + x.amountCents, 0);
  const purchases = sum(data.entries.filter((e) => e.kind === 'purchase'));
  const subscriptions = sum(data.entries.filter((e) => e.kind === 'subscription'));
  const fixed = sum(data.fixedExpenses);
  const income = sum(data.incomes);
  const expenses = purchases + subscriptions + fixed;
  return { purchases, subscriptions, fixed, income, expenses, balance: income - expenses };
}

const brl = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

export function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

type Column = { label: string; width: number; align?: 'left' | 'right'; muted?: boolean };

/**
 * Monthly report of one tenant. Same content and section order as always
 * (entries of the period, overall total, the tenant's balance), drawn in the
 * app's visual identity: Inter, zinc neutrals, indigo accent, 1px borders and
 * rounded boxes; tables repeat their header on new pages; every page has a
 * footer with page numbers.
 */
export function createTenantReportPdf(data: TenantReportData): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: {
      Title: `Relatório mensal · ${data.tenantName} · ${monthLabel(data.year, data.month)}`,
      Author: 'Financial App',
    },
  });
  doc.registerFont('Inter', FONT_REGULAR);
  doc.registerFont('Inter-SemiBold', FONT_SEMIBOLD);

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 22; // room for the footer
  const totals = reportTotals(data);
  const monthStr = `${String(data.month).padStart(2, '0')}/${data.year}`;
  const newPage = () => {
    doc.addPage();
    doc.y = doc.page.margins.top;
  };

  // ---- Header: brand, title, tenant and month ----------------------------
  const top = doc.page.margins.top;
  doc.image(LOGO_MARK, left, top, { width: 24, height: 24 });
  doc.font('Inter-SemiBold').fontSize(12).fillColor(C.text).text('Financial App', left + 32, top + 5);
  // Period chip (indigo tonal), as in the app.
  doc.font('Inter-SemiBold').fontSize(9);
  const chipW = doc.widthOfString(monthStr) + 20;
  doc.roundedRect(left + width - chipW, top + 2, chipW, 20, 10).fill(C.primarySubtle);
  doc.fillColor(C.primary).text(monthStr, left + width - chipW, top + 7.5, { width: chipW, align: 'center' });
  doc.moveTo(left, top + 38).lineTo(left + width, top + 38).lineWidth(1).strokeColor(C.border).stroke();

  doc.y = top + 54;
  doc.font('Inter-SemiBold').fontSize(20).fillColor(C.text).text('Relatório mensal', left, doc.y);
  const metaY = doc.y + 6;
  const meta = (label: string, value: string, x: number) => {
    doc.font('Inter').fontSize(9.5).fillColor(C.muted).text(`${label}: `, x, metaY, { continued: true });
    doc.font('Inter-SemiBold').fillColor(C.text).text(value);
  };
  meta('Responsável', data.tenantName.trim(), left);
  meta('Mês', monthStr, left + 220);
  doc.y = metaY + 30;

  // ---- Building blocks -------------------------------------------------------
  const sectionTitle = (title: string, size = 12) => {
    if (doc.y + 70 > bottom()) newPage();
    doc.font('Inter-SemiBold').fontSize(size).fillColor(C.text).text(title, left, doc.y);
    doc.y += 6;
  };
  const tableHeader = (cols: Column[]) => {
    const y = doc.y;
    doc.roundedRect(left, y, width, 22, 6).fill(C.subtle);
    let x = left;
    for (const c of cols) {
      doc.font('Inter-SemiBold').fontSize(8).fillColor(C.secondary)
        .text(c.label, x + 10, y + 7, { width: c.width - 20, align: c.align ?? 'left', lineBreak: false });
      x += c.width;
    }
    doc.y = y + 22;
  };
  /** Rows with a light divider; the optional total row is bold under a border. */
  const table = (cols: Column[], rows: string[][], total?: string[]) => {
    tableHeader(cols);
    for (const row of rows) {
      doc.font('Inter').fontSize(9);
      const h = Math.max(...row.map((cell, i) => doc.heightOfString(cell, { width: cols[i].width - 20 }))) + 9;
      if (doc.y + h > bottom()) {
        newPage();
        tableHeader(cols);
      }
      const y = doc.y;
      let x = left;
      row.forEach((cell, i) => {
        const c = cols[i];
        doc.font('Inter').fontSize(9).fillColor(c.muted ? C.muted : C.text)
          .text(cell, x + 10, y + 4.5, { width: c.width - 20, align: c.align ?? 'left' });
        x += c.width;
      });
      doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.75).strokeColor(C.subtle).stroke();
      doc.y = y + h;
    }
    if (total) {
      if (doc.y + 24 > bottom()) newPage();
      const y = doc.y;
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1).strokeColor(C.border).stroke();
      let x = left;
      total.forEach((cell, i) => {
        doc.font('Inter-SemiBold').fontSize(9).fillColor(C.text)
          .text(cell, x + 10, y + 7, { width: cols[i].width - 20, align: cols[i].align ?? 'left' });
        x += cols[i].width;
      });
      doc.y = y + 24;
    }
    doc.y += 14;
  };
  type BoxRow = { label: string; cents: number; strong?: boolean; signed?: boolean };
  /** Rounded box of label/value lines (totals); strong lines get a divider above. */
  const totalsBox = (rows: BoxRow[]) => {
    const rowH = 21;
    const h = rows.length * rowH + 12;
    if (doc.y + h > bottom()) newPage();
    const y0 = doc.y;
    doc.roundedRect(left, y0, width, h, 8).lineWidth(1).strokeColor(C.border).stroke();
    rows.forEach((r, i) => {
      const y = y0 + 6 + i * rowH;
      if (r.strong && i > 0) {
        doc.moveTo(left + 12, y).lineTo(left + width - 12, y).lineWidth(0.75).strokeColor(C.border).stroke();
      }
      const color = r.signed ? (r.cents < 0 ? C.negative : C.positive) : C.text;
      const font = r.strong ? 'Inter-SemiBold' : 'Inter';
      const size = r.strong ? 10.5 : 9.5;
      doc.font(font).fontSize(size).fillColor(r.strong ? C.text : C.secondary)
        .text(r.label, left + 16, y + 5.5, { lineBreak: false });
      doc.font(font).fontSize(size).fillColor(color)
        .text(brl(r.cents), left, y + 5.5, { width: width - 16, align: 'right', lineBreak: false });
    });
    doc.y = y0 + h + 18;
  };

  // ---- Lançamentos do período ---------------------------------------------
  sectionTitle('Lançamentos do período');
  if (data.entries.length) {
    table(
      [
        { label: 'Descrição', width: width - 250 },
        { label: 'Origem', width: 140, muted: true },
        { label: 'Valor', width: 110, align: 'right' },
      ],
      data.entries.map((e) => [e.label, e.origin, brl(e.amountCents)]),
    );
  } else {
    doc.font('Inter').fontSize(9).fillColor(C.muted).text('Sem lançamentos no período.', left, doc.y);
    doc.y += 24;
  }

  // ---- Total geral --------------------------------------------------------------
  sectionTitle('Total geral');
  totalsBox([
    { label: 'Compras', cents: totals.purchases },
    { label: 'Assinaturas', cents: totals.subscriptions },
    { label: 'Despesas fixas', cents: totals.fixed },
    { label: 'Total', cents: totals.expenses, strong: true },
  ]);

  // ---- Saldo do responsável (when there is income or fixed expenses) -----
  if (data.incomes.length || data.fixedExpenses.length) {
    sectionTitle('Saldo do responsável');
    const simpleCols: Column[] = [
      { label: 'Descrição', width: width - 110 },
      { label: 'Valor', width: 110, align: 'right' },
    ];
    sectionTitle('Fontes de renda', 10);
    table(simpleCols, data.incomes.map((r) => [r.description, brl(r.amountCents)]), ['Total de renda', brl(totals.income)]);
    sectionTitle('Despesas fixas', 10);
    table(simpleCols, data.fixedExpenses.map((r) => [r.description, brl(r.amountCents)]), ['Total despesas fixas', brl(totals.fixed)]);
    totalsBox([
      { label: 'Gastos no relatório', cents: totals.purchases + totals.subscriptions },
      { label: 'Total de despesas', cents: totals.expenses },
      { label: 'Saldo restante', cents: totals.balance, strong: true, signed: true },
    ]);
  }

  // ---- Footer on every page ----------------------------------------------
  const generated = data.generatedAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing in the margin must not open a new page
    const y = doc.page.height - savedBottom - 14;
    doc.moveTo(left, y - 6).lineTo(left + width, y - 6).lineWidth(0.75).strokeColor(C.border).stroke();
    doc.font('Inter').fontSize(7.5).fillColor(C.muted)
      .text(`Financial App · ${data.tenantName.trim()} · gerado em ${generated}`, left, y, { lineBreak: false });
    doc.text(`Página ${i - range.start + 1} de ${range.count}`, left, y, { width, align: 'right', lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }
  return doc;
}
