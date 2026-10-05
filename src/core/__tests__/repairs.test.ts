import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, degrees } from '../pdflib';
import { buildPdf } from '../engine';
import { geometryFromTextItem } from '../registry';
import { localPdfPoint } from '../draw';
import { displayedRotation, migrateStoredPages, normalizePages } from '../../state/store';
import { fileToSource } from '../importers';
import { hasPdfHeader, normalizePdfBytes } from '../pdfbytes';
import { toArrayBuffer } from '../pdfjs';
import { emptySettings } from './fixtures';
import type { PageEntry, SourceDoc } from '../types';

describe('page rotation is not applied twice', () => {
  it('keeps user rotation separate from the source /Rotate', () => {
    const [page] = normalizePages([
      {
        id: 'p',
        index: 0,
        sourceId: 's',
        sourceIndex: 0,
        rotation: 0,
        baseRotation: 90,
        width: 0,
        height: 0,
        mediaWidth: 595,
        mediaHeight: 842,
      },
    ]);
    expect(page.rotation).toBe(0);
    expect(page.baseRotation).toBe(90);
    expect(displayedRotation(page)).toBe(90);
    expect(page.width).toBe(842);
    expect(page.height).toBe(595);
  });

  it('does not fold the source rotation in on every subsequent rotate', () => {
    const once = normalizePages([
      {
        id: 'p',
        index: 0,
        sourceId: 's',
        sourceIndex: 0,
        rotation: 90,
        baseRotation: 90,
        width: 842,
        height: 595,
        mediaWidth: 595,
        mediaHeight: 842,
      },
    ]);
    expect(once[0].rotation).toBe(90);
    expect(displayedRotation(once[0])).toBe(180);
    const twice = normalizePages(once.map((page) => ({ ...page, rotation: page.rotation + 90 })));
    expect(twice[0].rotation).toBe(180);
    expect(displayedRotation(twice[0])).toBe(270);
  });

  it('migrates sessions that already folded the source rotation into the user rotation', () => {
    const legacy = migrateStoredPages(
      [
        {
          id: 'p',
          index: 0,
          sourceId: 's',
          sourceIndex: 0,
          rotation: 90,
          baseRotation: 90,
          width: 842,
          height: 595,
          mediaWidth: 595,
          mediaHeight: 842,
        },
      ],
      1,
    );
    expect(legacy[0].rotation).toBe(0);
    const current = migrateStoredPages(legacy, 2);
    expect(current[0].rotation).toBe(0);
  });
});

describe('text item geometry', () => {
  it('uses the PDF-space transform directly', () => {
    const geo = geometryFromTextItem({ transform: [14, 0, 0, 14, 72, 700], width: 70, height: 14 });
    expect(geo.origin).toEqual({ x: 72, y: 700 });
    expect(geo.quad.x).toBeCloseTo(72);
    expect(geo.quad.y).toBeCloseTo(700);
    expect(geo.quad.w).toBeCloseTo(70);
    expect(geo.quad.h).toBeCloseTo(14);
    expect(geo.fontSize).toBeCloseTo(14);
  });
});

describe('local drawing coordinates', () => {
  it('treats normalized y as up, matching the on-screen ink', () => {
    const box = { x: 10, y: 20, w: 100, h: 40 };
    expect(localPdfPoint(box, 0, 0)).toEqual({ x: 10, y: 20 });
    expect(localPdfPoint(box, 1, 1)).toEqual({ x: 110, y: 60 });
  });
});

describe('pdf bytes stay usable after the viewer opens them', () => {
  it('gives pdf.js its own copy so the store buffer is not detached', () => {
    const src = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const copy = toArrayBuffer(src);
    new Uint8Array(copy)[0] = 0;
    expect(src[0]).toBe(0x25);
    expect(copy).not.toBe(src.buffer);
  });

  it('finds a PDF header that is not at byte 0 and restores JSON-cloned bytes', () => {
    const raw = new Uint8Array([1, 2, 3, 0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect(normalizePdfBytes(raw)[0]).toBe(0x25);
    const asJson = JSON.parse(JSON.stringify(raw)) as Record<string, number>;
    expect(hasPdfHeader(normalizePdfBytes(asJson))).toBe(true);
  });
});

describe('source import geometry', () => {
  it('keeps the source /Rotate instead of waiting for the viewer to measure the page', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 400]);
    page.setRotation(degrees(90));
    const bytes = await doc.save();
    const file = {
      arrayBuffer: async () => {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        return copy.buffer;
      },
    } as Blob;
    const result = await fileToSource(file, 'sideways.pdf');
    expect(result.source.pageInfo?.[0]?.baseRotation).toBe(90);
    expect(result.source.pageInfo?.[0]?.mediaWidth).toBe(200);
    expect(result.source.pageInfo?.[0]?.mediaHeight).toBe(400);
  });
});

describe('exported page rotation', () => {
  it('keeps a source /Rotate of 90 when the user has not rotated the page', async () => {
    const src = await PDFDocument.create();
    const page = src.addPage([595, 842]);
    page.drawText('Sideways', { x: 72, y: 400, size: 14, font: src.embedStandardFont(StandardFonts.Helvetica) });
    page.setRotation(degrees(90));
    const bytes = await src.save();
    const source: SourceDoc = {
      id: 'src',
      name: 'rot.pdf',
      bytes,
      pageCount: 1,
      size: bytes.length,
      loadedAt: 1,
    };
    const entry: PageEntry = {
      id: 'p',
      index: 0,
      sourceId: 'src',
      sourceIndex: 0,
      rotation: 0,
      baseRotation: 90,
      width: 842,
      height: 595,
      mediaWidth: 595,
      mediaHeight: 842,
    };
    const result = await buildPdf({
      ...emptySettings(),
      pages: [entry],
      objectsByPage: {},
      assets: {},
      sources: { src: source },
    });
    const out = await PDFDocument.load(result.bytes);
    expect(out.getPage(0).getRotation().angle).toBe(90);
  });

  it('does not wipe an unmeasured source /Rotate on export', async () => {
    const src = await PDFDocument.create();
    const page = src.addPage([595, 842]);
    page.drawText('Sideways', { x: 72, y: 400, size: 14, font: src.embedStandardFont(StandardFonts.Helvetica) });
    page.setRotation(degrees(90));
    const bytes = await src.save();
    const source: SourceDoc = { id: 'src', name: 'rot.pdf', bytes, pageCount: 1, size: bytes.length, loadedAt: 1 };
    const result = await buildPdf({
      ...emptySettings(),
      pages: [
        {
          id: 'p',
          index: 0,
          sourceId: 'src',
          sourceIndex: 0,
          rotation: 0,
          baseRotation: 0,
          width: 0,
          height: 0,
          mediaWidth: 0,
          mediaHeight: 0,
        },
      ],
      objectsByPage: {},
      assets: {},
      sources: { src: source },
    });
    const out = await PDFDocument.load(result.bytes);
    expect(out.getPage(0).getRotation().angle).toBe(90);
  });

  it('exports a file whose %PDF header is preceded by scanner junk', async () => {
    const src = await PDFDocument.create();
    src.addPage([220, 280]);
    const raw = await src.save();
    const junk = new Uint8Array(raw.length + 6);
    junk.set([0x00, 0x01, 0x02, 0x03, 0x04, 0x05], 0);
    junk.set(raw, 6);
    const source: SourceDoc = { id: 'src', name: 'preamble.pdf', bytes: junk, pageCount: 1, size: junk.length, loadedAt: 1 };
    const result = await buildPdf({
      ...emptySettings(),
      pages: [
        {
          id: 'p',
          index: 0,
          sourceId: 'src',
          sourceIndex: 0,
          rotation: 0,
          baseRotation: 0,
          width: 220,
          height: 280,
          mediaWidth: 220,
          mediaHeight: 280,
        },
      ],
      objectsByPage: {},
      assets: {},
      sources: { src: source },
    });
    const out = await PDFDocument.load(result.bytes);
    expect(out.getPageCount()).toBe(1);
  });
});
