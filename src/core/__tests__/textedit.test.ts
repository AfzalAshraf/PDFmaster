import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, pdfLib } from '../pdflib';
import { applyPageEdits, decodeOperandText, pageBaseFonts, readPageContentOps } from '../textedit';
import type { TextEditOp } from '../types';

const { TextRenderingMode, setTextRenderingMode, pushGraphicsState, popGraphicsState } = pdfLib;

/** All Tj/TJ strings of a page, concatenated. */
function pageText(doc: PDFDocument, pageIndex = 0): string {
  return readPageContentOps(doc, doc.getPage(pageIndex))
    .filter((op) => op.name === 'Tj' || op.name === 'TJ')
    .flatMap((op) => op.args)
    .map((arg) => (Array.isArray(arg) ? arg.map(decodeOperandText).join('') : decodeOperandText(arg)))
    .join('');
}

const edit = (id: string, original: string, text: string, origin: { x: number; y: number }, fontName = 'Helv'): TextEditOp => ({
  id,
  pageId: 'p0',
  original,
  text,
  rect: { x: origin.x - 1, y: origin.y - 12, w: 80, h: 18 },
  origin,
  fontSize: 12,
  fontName,
  color: '#000000',
});

async function makeDoc(): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const helv = doc.embedStandardFont(StandardFonts.Helvetica);
  const timesBold = doc.embedStandardFont(StandardFonts.TimesRomanBold);

  // Page 1: plain visible runs (twice the same word at two positions).
  const page1 = doc.addPage([595.28, 841.89]);
  page1.drawText('Hello world', { x: 72, y: 700, size: 14, font: helv });
  page1.drawText('Second line', { x: 72, y: 670, size: 14, font: helv });
  page1.drawText('Twice', { x: 100, y: 600, size: 12, font: helv });
  page1.drawText('Twice', { x: 300, y: 600, size: 12, font: helv });

  // Page 2: invisible OCR-style runs (wrapped graphics state), a bold serif
  // invisible run, and a page-level `3 Tr` that is never reset.
  const page2 = doc.addPage([595.28, 841.89]);
  page2.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
  page2.drawText('Strategy', { x: 100, y: 700, size: 12, font: helv });
  page2.pushOperators(setTextRenderingMode(TextRenderingMode.Fill), popGraphicsState());
  page2.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
  page2.drawText('BoldWord', { x: 100, y: 660, size: 12, font: timesBold });
  page2.pushOperators(setTextRenderingMode(TextRenderingMode.Fill), popGraphicsState());
  page2.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
  page2.drawText('LeakedState', { x: 100, y: 620, size: 12, font: helv });

  // Page 3: invisible run trapped inside q/Q, then a visible run after Q —
  // the rendering state must be restored by the Q.
  const page3 = doc.addPage([595.28, 841.89]);
  page3.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
  page3.drawText('Trapped', { x: 100, y: 700, size: 12, font: helv });
  page3.pushOperators(setTextRenderingMode(TextRenderingMode.Fill), popGraphicsState());
  page3.drawText('Free', { x: 100, y: 660, size: 12, font: helv });

  return doc;
}

describe('applyPageEdits', () => {
  it('rewrites an ASCII run in place, preserving the content stream', async () => {
    const doc = await makeDoc();
    const res = applyPageEdits(doc, doc.getPage(0), [edit('e1', 'Hello world', 'Goodbye world', { x: 72, y: 700 })], []);
    expect(res.edit.applied).toBe(1);
    expect(res.edit.failed).toBe(0);
    expect(res.paint).toHaveLength(0);
    expect(pageText(doc, 0)).toContain('Goodbye world');
    expect(pageText(doc, 0)).not.toContain('Hello world');
  });

  it('blanks and re-paints a replacement the original font cannot encode', async () => {
    const doc = await makeDoc();
    const res = applyPageEdits(doc, doc.getPage(0), [edit('e1', 'Second line', 'Zweite Zeile ✓', { x: 72, y: 670 })], []);
    expect(res.edit.applied).toBe(1);
    expect(res.paint).toHaveLength(1);
    expect(res.paint[0].text).toBe('Zweite Zeile ✓');
    // A visible run is never covered — only invisible OCR-layer runs are.
    expect(res.paint[0].cover).toBeUndefined();
    expect(pageText(doc, 0)).not.toContain('Second line');
  });

  it('re-paints an invisible (OCR text layer) run with a covering box', async () => {
    const doc = await makeDoc();
    const res = applyPageEdits(doc, doc.getPage(1), [edit('e1', 'Strategy', 'Tactics', { x: 100, y: 700 })], []);
    expect(res.edit.applied).toBe(1);
    expect(res.edit.failed).toBe(0);
    // Invisible runs can never be rewritten in place: the replacement must be
    // painted visibly over the raster word, with a cover box for it.
    expect(res.paint).toHaveLength(1);
    expect(res.paint[0].text).toBe('Tactics');
    expect(res.paint[0].cover).toEqual(expect.objectContaining({ w: expect.any(Number) }));
    // The original invisible run is blanked so it no longer shows or selects.
    expect(pageText(doc, 1)).not.toContain('Strategy');
  });

  it('tracks a page-level leaked Tr 3 (no q/Q) and re-paints over it', async () => {
    const doc = await makeDoc();
    const res = applyPageEdits(doc, doc.getPage(1), [edit('e1', 'LeakedState', 'Fixed', { x: 100, y: 620 })], []);
    expect(res.edit.applied).toBe(1);
    expect(res.paint).toHaveLength(1);
    expect(res.paint[0].text).toBe('Fixed');
    expect(res.paint[0].cover).toBeDefined();
  });

  it('restores the rendering state after Q: only the trapped run is painted', async () => {
    const doc = await makeDoc();
    const res = applyPageEdits(
      doc,
      doc.getPage(2),
      [
        edit('e1', 'Trapped', 'TrappedNew', { x: 100, y: 700 }),
        edit('e2', 'Free', 'FreeNew', { x: 100, y: 660 }),
      ],
      [],
    );
    expect(res.edit.applied).toBe(2);
    // Only the invisible run needs re-painting; the run after Q is visible
    // and is rewritten in place.
    expect(res.paint).toHaveLength(1);
    expect(res.paint[0].text).toBe('TrappedNew');
    expect(pageText(doc, 2)).toContain('FreeNew');
  });

  it('keeps repeated edits of the same run active — the newest wins', async () => {
    const doc = await makeDoc();
    const res = applyPageEdits(
      doc,
      doc.getPage(0),
      [
        edit('e1', 'Twice', 'Alpha', { x: 100, y: 600 }),
        edit('e2', 'Twice', 'Beta', { x: 100, y: 600 }),
      ],
      [],
    );
    expect(res.edit.applied).toBe(1);
    expect(res.edit.failed).toBe(0);
    expect(res.edit.failedEdits).toHaveLength(0);
    const text = pageText(doc, 0);
    expect(text).toContain('Beta');
    expect(text).not.toContain('Alpha');
    // The untouched second occurrence is left as-is.
    expect(text).toContain('Twice');
  });

  it('edits the same original text at two positions independently', async () => {
    const doc = await makeDoc();
    const res = applyPageEdits(
      doc,
      doc.getPage(0),
      [
        edit('e1', 'Twice', 'Alpha', { x: 100, y: 600 }),
        edit('e2', 'Twice', 'Beta', { x: 300, y: 600 }),
      ],
      [],
    );
    expect(res.edit.applied).toBe(2);
    expect(res.edit.failed).toBe(0);
    const text = pageText(doc, 0);
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).not.toContain('Twice');
  });

  it('reports unmatched edits with their originals', async () => {
    const doc = await makeDoc();
    const res = applyPageEdits(doc, doc.getPage(0), [edit('e1', 'Missing text', 'Nope', { x: 50, y: 50 })], []);
    expect(res.edit.applied).toBe(0);
    expect(res.edit.failed).toBe(1);
    expect(res.edit.failedEdits).toEqual([{ original: 'Missing text' }]);
  });

  it('maps font metadata from the page font resources (best effort)', async () => {
    const doc = await makeDoc();
    const res = applyPageEdits(doc, doc.getPage(1), [edit('e1', 'BoldWord', 'Neu', { x: 100, y: 660 })], []);
    expect(res.edit.applied).toBe(1);
    expect(res.paint).toHaveLength(1);
    // The run is drawn in a bold serif font, so the replacement picks up
    // that family/weight from the font's BaseFont.
    expect(res.paint[0].serif).toBe(true);
    expect(res.paint[0].bold).toBe(true);
    expect(res.paint[0].italic).toBe(false);
  });

  it('resolves font resource names to BaseFont names (on saved documents)', async () => {
    const doc = await makeDoc();
    // Font resource dictionaries are fully resolved after a save/reload, which
    // is the state the build pipeline sees (sources are always loaded files).
    const loaded = await PDFDocument.load(await doc.save());
    const fonts = pageBaseFonts(loaded.getPage(1));
    const values = [...fonts.values()];
    expect(values).toContain('Times-Bold');
    expect(values.some((v) => /Helvetica/.test(v))).toBe(true);
  });
});
