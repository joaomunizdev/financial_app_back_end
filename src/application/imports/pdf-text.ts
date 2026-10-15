// pdf.js legacy build: CommonJS and Node-compatible. Loaded lazily; on load it
// warns that rendering polyfills (canvas) are missing, which text extraction
// doesn't need, so those warnings are silenced.
let pdfjs: any;
function loadPdfjs() {
  if (!pdfjs) {
    const { log, warn } = console;
    console.log = console.warn = () => undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    } finally {
      console.log = log;
      console.warn = warn;
    }
  }
  return pdfjs;
}

export type PdfItem = { x: number; width: number; text: string };
export type PdfLine = { page: number; y: number; items: PdfItem[]; text: string };

/** Items closer than this (PDF units) vertically belong to the same line. */
const SAME_LINE = 2.5;
/** Horizontal gap under which two items are one word (pdf.js splits accented letters). */
const GLUED = 1;
/** Horizontal gap under which two items are one field (words separated by a space). */
const SAME_FIELD = 4;

/** Joins pieces of the same word/field so columns stay apart but words don't break. */
function mergeChunks(items: PdfItem[]): PdfItem[] {
  const out: PdfItem[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    const gap = prev ? it.x - (prev.x + prev.width) : Infinity;
    if (prev && gap < SAME_FIELD) {
      prev.text += (gap < GLUED ? '' : ' ') + it.text;
      prev.width = it.x + it.width - prev.x;
    } else {
      out.push({ ...it });
    }
  }
  return out;
}

/**
 * Text of a PDF as visual lines, top to bottom, each with its items left to
 * right and their x position (so parsers can split side-by-side columns).
 */
export async function pdfLines(data: Buffer | Uint8Array): Promise<PdfLine[]> {
  const doc = await loadPdfjs().getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const lines: PdfLine[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const raw: { x: number; y: number; width: number; text: string }[] = [];
      for (const it of content.items as { str?: string; transform: number[]; width: number }[]) {
        const text = (it.str ?? '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        raw.push({ x: it.transform[4], y: it.transform[5], width: it.width, text });
      }
      raw.sort((a, b) => b.y - a.y || a.x - b.x);
      const pageLines: PdfLine[] = [];
      for (const it of raw) {
        const line = pageLines.find((l) => Math.abs(l.y - it.y) <= SAME_LINE);
        if (line) line.items.push({ x: it.x, width: it.width, text: it.text });
        else pageLines.push({ page: p, y: it.y, items: [{ x: it.x, width: it.width, text: it.text }], text: '' });
      }
      for (const l of pageLines) {
        l.items = mergeChunks(l.items.sort((a, b) => a.x - b.x));
        l.text = l.items.map((i) => i.text).join(' ');
      }
      pageLines.sort((a, b) => b.y - a.y);
      lines.push(...pageLines);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return lines;
}
