import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '../pdflib';
import type { BuildInput } from '../engine';
import { exportDocument } from '../exporter';
import { emptySettings } from './fixtures';
import type { PageEntry, SourceDoc, TextEditOp } from '../types';

async function makeFixture(): Promise<BuildInput> {
  const doc = await PDFDocument.create();
  const font = doc.embedStandardFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  page.drawText('Hello world', { x: 72, y: 700, size: 14, font });
  const bytes = await doc.save();
  const source: SourceDoc = {
    id: 'src1',
    name: 'source.pdf',
    bytes,
    pageCount: 1,
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
  ];
  return {
    ...emptySettings(),
    pages,
    objectsByPage: {},
    assets: {},
    sources: { src1: source },
  };
}

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

describe('exportDocument', () => {
  it('uses the (editable) file name supplied by the export dialog', async () => {
    const input = await makeFixture();
    const out = await exportDocument({
      input,
      filename: 'Quarterly Report v2',
      options: { format: 'pdf', quality: 92, scale: 2, pages: 'all', customPages: '', pdfA: false, embedFonts: false, ocr: true, flatten: false },
      activePageIndex: 0,
    });
    expect(out.filename).toBe('Quarterly Report v2.pdf');
    expect(out.stats?.editsFailed ?? 0).toBe(0);
  });

  it('sanitises unsafe file names', async () => {
    const input = await makeFixture();
    const out = await exportDocument({
      input,
      filename: 'bad/name?',
      options: { format: 'pdf', quality: 92, scale: 2, pages: 'all', customPages: '', pdfA: false, embedFonts: false, ocr: true, flatten: false },
      activePageIndex: 0,
    });
    expect(out.filename).not.toContain('/');
    expect(out.filename).not.toContain('?');
    expect(out.filename.endsWith('.pdf')).toBe(true);
  });

  it('surfaces applied and failed edits in the export stats', async () => {
    const input = await makeFixture();
    input.textEdits = [
      edit,
      { ...edit, id: 'e2', original: 'Missing', origin: { x: 300, y: 500 } },
    ];
    const out = await exportDocument({
      input,
      filename: 'edits',
      options: { format: 'pdf', quality: 92, scale: 2, pages: 'all', customPages: '', pdfA: false, embedFonts: false, ocr: true, flatten: false },
      activePageIndex: 0,
    });
    expect(out.stats?.editsApplied).toBe(1);
    expect(out.stats?.editsFailed).toBe(1);
    expect(out.stats?.editErrors).toHaveLength(1);
    expect(out.stats?.editErrors[0]).toContain('Missing');
  });
});
