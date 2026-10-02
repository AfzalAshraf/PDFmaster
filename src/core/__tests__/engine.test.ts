import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, degrees, pdfLib } from '../pdflib';
import { buildPdf, visualToContent, type BuildInput } from '../engine';
import { decodeOperandText, readPageContentOps } from '../textedit';

/** Decodes every show-text operator of a page into one plain string. */
function pageText(doc: Awaited<ReturnType<typeof PDFDocument.load>>): string {
  return readPageContentOps(doc, doc.getPage(0))
    .filter((op) => op.name === 'Tj' || op.name === 'TJ')
    .flatMap((op) => op.args)
    .map((arg) => (Array.isArray(arg) ? arg.map(decodeOperandText).join('') : decodeOperandText(arg)))
    .join('');
}
import { emptySettings } from './fixtures';
import type { AnyObject, Asset, PageEntry, SourceDoc, TextEditOp } from '../types';

const { PDFName } = pdfLib;

/** 1x1 transparent PNG. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function makeSourcePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = doc.embedStandardFont(StandardFonts.Helvetica);
  const page1 = doc.addPage([595.28, 841.89]);
  page1.drawText('Hello world', { x: 72, y: 700, size: 14, font });
  const page2 = doc.addPage([595.28, 841.89]);
  page2.setRotation(degrees(90));
  page2.drawText('Second page', { x: 72, y: 700, size: 14, font });
  return doc.save();
}

async function makeFixture() {
  const bytes = await makeSourcePdf();
  const source: SourceDoc = {
    id: 'src1',
    name: 'source.pdf',
    bytes,
    pageCount: 2,
    size: bytes.length,
    loadedAt: Date.now(),
  };
  const pages: PageEntry[] = [
    {
      id: 'p1',
      index: 0,
      sourceId: 'src1',
      sourceIndex: 0,
      rotation: 0,
      baseRotation: 0,
      width: 595.28,
      height: 841.89,
      mediaWidth: 595.28,
      mediaHeight: 841.89,
    },
    {
      id: 'p2',
      index: 1,
      sourceId: 'src1',
      sourceIndex: 1,
      rotation: 0,
      baseRotation: 90,
      width: 841.89,
      height: 595.28,
      mediaWidth: 595.28,
      mediaHeight: 841.89,
    },
  ];
  const assets: Record<string, Asset> = {
    img1: { id: 'img1', dataUrl: TINY_PNG, mime: 'image/png', width: 1, height: 1, bytes: 68 },
  };
  const objectsByPage: Record<string, AnyObject[]> = {
    p1: [
      {
        id: 'o1',
        pageId: 'p1',
        kind: 'highlight',
        x: 72,
        y: 696,
        w: 80,
        h: 18,
        rotation: 0,
        opacity: 0.4,
        color: '#ffd400',
        quads: [{ x: 72, y: 696, w: 80, h: 18 }],
        text: 'Hello',
      },
      {
        id: 'o2',
        pageId: 'p1',
        kind: 'note',
        x: 400,
        y: 700,
        w: 18,
        h: 18,
        rotation: 0,
        opacity: 1,
        color: '#ffd400',
        text: 'Please review',
      },
      {
        id: 'o3',
        pageId: 'p1',
        kind: 'textbox',
        x: 100,
        y: 500,
        w: 200,
        h: 40,
        rotation: 0,
        opacity: 1,
        text: 'Inserted text',
        style: { fontFamily: 'Helvetica', fontSize: 12, color: '#111111' },
      },
      {
        id: 'o4',
        pageId: 'p1',
        kind: 'shape',
        x: 300,
        y: 400,
        w: 120,
        h: 80,
        rotation: 15,
        opacity: 1,
        shape: 'rect',
        stroke: '#ff4a3d',
        strokeWidth: 2,
      },
      {
        id: 'o5',
        pageId: 'p1',
        kind: 'ink',
        x: 100,
        y: 300,
        w: 120,
        h: 60,
        rotation: 0,
        opacity: 1,
        color: '#2f89ff',
        strokeWidth: 2,
        strokes: [
          [
            { x: 0, y: 0 },
            { x: 0.5, y: 1 },
            { x: 1, y: 0 },
          ],
        ],
      },
      {
        id: 'o6',
        pageId: 'p1',
        kind: 'stamp',
        x: 350,
        y: 250,
        w: 150,
        h: 50,
        rotation: 0,
        opacity: 1,
        label: 'APPROVED',
        color: '#1a7f37',
        variant: 'standard',
      },
      {
        id: 'o7',
        pageId: 'p1',
        kind: 'image',
        x: 420,
        y: 600,
        w: 100,
        h: 60,
        rotation: 0,
        opacity: 1,
        assetId: 'img1',
        fit: 'contain',
      },
      {
        id: 'o8',
        pageId: 'p1',
        kind: 'measure',
        x: 120,
        y: 200,
        w: 200,
        h: 40,
        rotation: 0,
        opacity: 1,
        from: { x: 0, y: 1 },
        to: { x: 1, y: 0 },
        stroke: '#d92c1f',
        strokeWidth: 1,
        pixelsPerUnit: 72,
        unitLabel: 'in',
        scale: 0.5,
      },
      {
        id: 'o9',
        pageId: 'p1',
        kind: 'link',
        x: 72,
        y: 640,
        w: 120,
        h: 16,
        rotation: 0,
        opacity: 1,
        url: 'https://example.com/docs',
        linkType: 'url',
      },
      {
        id: 'o10',
        pageId: 'p1',
        kind: 'formfield',
        x: 72,
        y: 120,
        w: 200,
        h: 24,
        rotation: 0,
        opacity: 1,
        field: 'text',
        name: 'FullName',
        value: '',
      },
    ],
    p2: [],
  };
  const base = emptySettings();
  const input: BuildInput = {
    ...base,
    pages,
    objectsByPage,
    assets,
    sources: { src1: source },
    meta: { ...base.meta, title: 'Test document', author: 'PDFmaster QA' },
    bookmarks: [{ id: 'b1', pageIndex: 1, title: 'Second page', createdAt: Date.now() }],
    watermark: { ...base.watermark, enabled: true, text: 'CONFIDENTIAL' },
    pageNumbers: { ...base.pageNumbers, enabled: true },
    bates: { ...base.bates, enabled: true, prefix: 'BATES-', startAt: 1 },
  };
  return input;
}

describe('buildPdf', () => {
  it('produces a valid multi-page PDF with all object kinds', async () => {
    const input = await makeFixture();
    const result = await buildPdf(input);
    expect(result.bytes.byteLength).toBeGreaterThan(1000);
    expect(result.stats.pages).toBe(2);
    expect(result.stats.objects).toBe(10);

    const out = await PDFDocument.load(result.bytes);
    expect(out.getPageCount()).toBe(2);
    // base rotation is preserved
    expect(out.getPage(1).getRotation().angle).toBe(90);
    // link + note annotations were written for page 1
    const annots = out.getPage(0).node.Annots();
    expect(annots).toBeTruthy();
    const annotsArray = out.context.lookup(annots);
    expect(annotsArray instanceof pdfLib.PDFArray).toBe(true);
    // the text form field survives
    expect(out.getForm().getFields().map((f) => f.getName())).toContain('FullName');
    // outline / bookmarks were written
    expect(out.catalog.get(PDFName.of('Outlines'))).toBeTruthy();
  });

  it('removes redacted text from the content stream for real', async () => {
    const input = await makeFixture();
    const redact: AnyObject = {
      id: 'r1',
      pageId: 'p1',
      kind: 'redact',
      x: 60,
      y: 690,
      w: 200,
      h: 30,
      rotation: 0,
      opacity: 1,
      color: '#000000',
    };
    input.objectsByPage.p1 = [redact, ...input.objectsByPage.p1];
    const result = await buildPdf(input);
    expect(result.stats.redactions).toBeGreaterThan(0);

    const out = await PDFDocument.load(result.bytes);
    expect(pageText(out)).not.toContain('Hello');
  });

  it('applies in-place text edits', async () => {
    const input = await makeFixture();
    const edit: TextEditOp = {
      id: 'e1',
      pageId: 'p1',
      original: 'Hello world',
      text: 'Goodbye world',
      rect: { x: 70, y: 694, w: 90, h: 20 },
      origin: { x: 72, y: 700 },
      fontSize: 14,
      fontName: 'Helvetica',
      color: '#000000',
    };
    input.textEdits = [edit];
    const result = await buildPdf(input);
    expect(result.stats.editsApplied).toBe(1);
    expect(result.stats.editsFailed).toBe(0);

    const out = await PDFDocument.load(result.bytes);
    expect(pageText(out)).toContain('Goodbye world');
  });

  it('encrypts with AES-256 and enforces the user password', async () => {
    const input = await makeFixture();
    input.security = {
      ...input.security,
      enabled: true,
      userPassword: 's3cret!',
      ownerPassword: 'owner-pass',
      algorithm: 'AES-256',
    };
    const result = await buildPdf(input);
    const withPassword = await PDFDocument.load(result.bytes, { password: 's3cret!' });
    expect(withPassword.getPageCount()).toBe(2);
    await expect(PDFDocument.load(result.bytes)).rejects.toThrow();
  });

  it('flattens form fields and produces PDF/A metadata on demand', async () => {
    const input = await makeFixture();
    input.options = { flattenForms: true, pdfA: true };
    const result = await buildPdf(input);
    const out = await PDFDocument.load(result.bytes);
    expect(out.getForm().getFields().length).toBe(0);
    expect(result.warnings.length).toBeLessThan(3);
  });

  it('reports a clear error when a source cannot be loaded', async () => {
    const input = await makeFixture();
    input.sources = {};
    await expect(buildPdf(input)).rejects.toThrow(/could not be included/i);
  });
});

describe('visualToContent', () => {
  const geo = { width: 595, height: 842, contentWidth: 595, contentHeight: 842, rotation: 0 };
  it('maps visual space to PDF space for every rotation', () => {
    expect(visualToContent({ ...geo, rotation: 0 }, 0, 0)).toEqual({ x: 0, y: 842 });
    expect(visualToContent({ ...geo, rotation: 180 }, 0, 0)).toEqual({ x: 595, y: 0 });
    expect(visualToContent({ ...geo, rotation: 90 }, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(visualToContent({ ...geo, rotation: 270 }, 0, 0)).toEqual({ x: 595, y: 842 });
  });
});
