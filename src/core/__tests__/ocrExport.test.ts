import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, pdfLib } from '../pdflib';
import { buildPdf, type BuildInput } from '../engine';
import { decodeOperandText, readPageContentOps } from '../textedit';
import { emptySettings } from './fixtures';
import type { PageEntry, SourceDoc, TextEditOp } from '../types';

const { TextRenderingMode, setTextRenderingMode, pushGraphicsState, popGraphicsState } = pdfLib;

/** Every show-text string of a page, concatenated. */
function textOf(doc: PDFDocument, pageIndex: number): string {
  return readPageContentOps(doc, doc.getPage(pageIndex))
    .filter((op) => op.name === 'Tj' || op.name === 'TJ')
    .flatMap((op) => op.args)
    .map((arg) => (Array.isArray(arg) ? arg.map(decodeOperandText).join('') : decodeOperandText(arg)))
    .join('');
}

function opsOf(doc: PDFDocument, pageIndex: number) {
  return readPageContentOps(doc, doc.getPage(pageIndex));
}

/**
 * Four-page source:
 *  p1 visible text, p2 blank "scan", p3 re-imported invisible OCR layer,
 *  p4 a page whose content stream leaks `3 Tr` without resetting it.
 */
async function makeSourcePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helv = doc.embedStandardFont(StandardFonts.Helvetica);

  const p1 = doc.addPage([595.28, 841.89]);
  p1.drawText('Hello world', { x: 72, y: 700, size: 14, font: helv });

  doc.addPage([595.28, 841.89]); // p2: blank scan stand-in

  const p3 = doc.addPage([595.28, 841.89]);
  p3.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
  p3.drawText('Strategy', { x: 100, y: 700, size: 12, font: helv });
  p3.pushOperators(setTextRenderingMode(TextRenderingMode.Fill), popGraphicsState());
  p3.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
  p3.drawText('Good', { x: 200, y: 700, size: 12, font: helv });
  p3.pushOperators(setTextRenderingMode(TextRenderingMode.Fill), popGraphicsState());

  const p4 = doc.addPage([595.28, 841.89]);
  p4.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible)); // never reset
  p4.drawText('LeakedRun', { x: 100, y: 700, size: 12, font: helv });

  return doc.save();
}

async function makeFixture(): Promise<BuildInput> {
  const bytes = await makeSourcePdf();
  const source: SourceDoc = {
    id: 'src1',
    name: 'mixed.pdf',
    bytes,
    pageCount: 4,
    size: bytes.length,
    loadedAt: Date.now(),
  };
  const pages: PageEntry[] = [0, 1, 2, 3].map((sourceIndex) => ({
    id: `p${sourceIndex + 1}`,
    index: sourceIndex,
    sourceId: 'src1',
    sourceIndex,
    rotation: 0,
    baseRotation: 0,
    width: 595.28,
    height: 841.89,
    mediaWidth: 595.28,
    mediaHeight: 841.89,
  }));
  return {
    ...emptySettings(),
    pages,
    objectsByPage: {},
    assets: {},
    sources: { src1: source },
  };
}

const theEdit = (pageId: string, original: string, text: string, origin: { x: number; y: number }): TextEditOp => ({
  id: `e-${original}`,
  pageId,
  original,
  text,
  rect: { x: origin.x - 1, y: origin.y - 12, w: 70, h: 18 },
  origin,
  fontSize: 12,
  fontName: 'Helv',
  color: '#000000',
});

describe('buildPdf — OCR-layer text edits', () => {
  it('covers the raster word and draws visible, searchable replacement text', async () => {
    const input = await makeFixture();
    input.textEdits = [theEdit('p3', 'Strategy', 'Tactics', { x: 100, y: 700 })];
    const result = await buildPdf(input);
    expect(result.stats.editsApplied).toBe(1);
    expect(result.stats.editsFailed).toBe(0);
    expect(result.stats.editErrors).toHaveLength(0);

    const out = await PDFDocument.load(result.bytes);
    const text = textOf(out, 2);
    expect(text).toContain('Tactics');
    expect(text).not.toContain('Strategy');
    // The other (unreplaced) invisible word stays selectable.
    expect(text).toContain('Good');
    const ops = opsOf(out, 2);
    // A cover rectangle (filled path) was painted over the scanned word…
    expect(ops.some((op) => op.name === 'f')).toBe(true);
    // …and the replacement is wrapped in an explicit "fill" rendering mode
    // so the inherited invisible state cannot hide it.
    expect(ops.some((op) => op.name === 'Tr' && op.args[0] === 0)).toBe(true);
  });

  it('resets a page-level leaked Tr 3 so the replacement stays visible', async () => {
    const input = await makeFixture();
    input.textEdits = [theEdit('p4', 'LeakedRun', 'Healed', { x: 100, y: 700 })];
    const result = await buildPdf(input);
    expect(result.stats.editsApplied).toBe(1);

    const out = await PDFDocument.load(result.bytes);
    const text = textOf(out, 3);
    expect(text).toContain('Healed');
    expect(text).not.toContain('LeakedRun');
    // The source page leaks `3 Tr`; the export must write an explicit `0 Tr`.
    const ops = opsOf(out, 3);
    expect(ops.some((op) => op.name === 'Tr' && op.args[0] === 0)).toBe(true);
    expect(ops.some((op) => op.name === 'f')).toBe(true);
  });

  it('reports edits that cannot be found, with the page and the original', async () => {
    const input = await makeFixture();
    input.textEdits = [theEdit('p1', 'Not There', 'X', { x: 50, y: 50 })];
    const result = await buildPdf(input);
    expect(result.stats.editsFailed).toBe(1);
    expect(result.stats.editErrors).toHaveLength(1);
    expect(result.stats.editErrors[0]).toContain('Page 1');
    expect(result.stats.editErrors[0]).toContain('Not There');
  });
});

describe('buildPdf — OCR word replacements on scans', () => {
  const scanOcr = (replacements?: BuildInput['ocr']['p2']['replacements']) => ({
    p2: {
      pageId: 'p2',
      words: [
        { text: 'Strategy', rect: { x: 100, y: 700, w: 58, h: 14 } },
        { text: 'Good', rect: { x: 170, y: 700, w: 34, h: 14 } },
      ],
      text: 'Strategy Good',
      confidence: 88,
      ...(replacements ? { replacements } : {}),
    },
  });

  it('covers the scanned word, draws visible text and skips it in the layer', async () => {
    const input = await makeFixture();
    input.ocr = scanOcr([
      { id: 'r1', original: 'Strategy', text: 'Tactics', bg: '#f0f0ea' },
    ]);
    const result = await buildPdf(input);
    expect(result.stats.ocrReplaced).toBe(1);
    expect(result.stats.editErrors).toHaveLength(0);

    const out = await PDFDocument.load(result.bytes);
    const text = textOf(out, 1);
    expect(text).toContain('Tactics');
    expect(text).not.toContain('Strategy');
    // The un-replaced word is still in the invisible text layer.
    expect(text).toContain('Good');
    const ops = opsOf(out, 1);
    expect(ops.some((op) => op.name === 'f')).toBe(true);
    expect(ops.some((op) => op.name === 'Tr' && op.args[0] === 0)).toBe(true);
  });

  it('reports replacements that match no recognised word', async () => {
    const input = await makeFixture();
    input.ocr = scanOcr([{ id: 'r1', original: 'NoSuchWord', text: 'X' }]);
    const result = await buildPdf(input);
    expect(result.stats.ocrReplaced).toBe(0);
    expect(result.stats.editErrors).toHaveLength(1);
    expect(result.stats.editErrors[0]).toContain('Page 2');
    expect(result.stats.editErrors[0]).toContain('NoSuchWord');
  });

  it('omits the invisible layer entirely when the OCR toggle is off', async () => {
    const input = await makeFixture();
    input.ocr = scanOcr();

    const withLayer = await buildPdf(input);
    const outOn = await PDFDocument.load(withLayer.bytes);
    expect(textOf(outOn, 1)).toContain('Good');

    const withoutLayer = await buildPdf({ ...input, options: { ...input.options, ocr: false } });
    const outOff = await PDFDocument.load(withoutLayer.bytes);
    expect(textOf(outOff, 1)).not.toContain('Good');
  });
});
