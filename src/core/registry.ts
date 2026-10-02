/**
 * Runtime registry that owns the pdf.js documents.
 *
 * pdf.js objects are heavy and cannot live in the (serialisable) editor store,
 * so they are cached here, keyed by source document id, and pages are rendered
 * on demand. Text content is extracted once per page and cached for search,
 * text editing and the Office/Markdown exports.
 */
import { openDocument, type PdfDocumentProxy, type PdfPageProxy } from './pdfjs';
import type { Quad, SearchMatch, SourceDoc, SourcePageData, TextItem } from './types';
import { normalizeText } from './utils';

interface Entry {
  proxy?: PdfDocumentProxy;
  loading?: Promise<PdfDocumentProxy>;
  text: Map<number, SourcePageData>;
}

const entries = new Map<string, Entry>();

function entryFor(sourceId: string): Entry {
  let entry = entries.get(sourceId);
  if (!entry) {
    entry = { text: new Map() };
    entries.set(sourceId, entry);
  }
  return entry;
}

export async function getDocumentProxy(source: SourceDoc): Promise<PdfDocumentProxy> {
  const entry = entryFor(source.id);
  if (entry.proxy) return entry.proxy;
  if (!entry.loading) {
    entry.loading = openDocument(source.bytes, { password: source.password })
      .then((proxy) => {
        entry.proxy = proxy;
        return proxy;
      })
      .catch((err) => {
        entry.loading = undefined;
        throw err;
      });
  }
  return entry.loading;
}

export async function getPageProxy(source: SourceDoc, index: number): Promise<PdfPageProxy> {
  const doc = await getDocumentProxy(source);
  return doc.getPage(Math.min(Math.max(index, 0), doc.numPages - 1) + 1);
}

export function forgetSource(sourceId: string): void {
  const entry = entries.get(sourceId);
  const proxy = entry?.proxy as unknown as { destroy?: () => Promise<void> } | undefined;
  void proxy?.destroy?.().catch(() => {});
  entries.delete(sourceId);
}

export function clearRegistry(): void {
  for (const id of [...entries.keys()]) forgetSource(id);
}

/** Text content of a page, converted into PDF user space (cached). */
export async function getPageTextData(source: SourceDoc, index: number): Promise<SourcePageData> {
  const entry = entryFor(source.id);
  const cached = entry.text.get(index);
  if (cached) return cached;
  const page = await getPageProxy(source, index);
  const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  let text = '';
  for (const raw of content.items) {
    const item = raw as { str?: string; transform?: number[]; width?: number; height?: number; fontName?: string; dir?: string; hasEOL?: boolean };
    if (!item.str || !item.transform) {
      if (item.hasEOL) text += '\n';
      continue;
    }
    const [a, b, c, d, e, f] = item.transform;
    const width = item.width ?? 0;
    const height = item.height ?? 10;
    // The item transform maps text space -> viewport space: (a,b) is the
    // (scaled) baseline direction, (c,d) the "up" direction of the run.
    const dirLen = Math.hypot(a, b) || 1;
    const upLen = Math.hypot(c, d) || 1;
    const start = viewport.convertToPdfPoint(e, f);
    const end = viewport.convertToPdfPoint(e + (width * a) / dirLen, f + (width * b) / dirLen);
    const up = viewport.convertToPdfPoint(e + (height * c) / upLen, f + (height * d) / upLen);
    const opposite = viewport.convertToPdfPoint(
      e + (width * a) / dirLen + (height * c) / upLen,
      f + (width * b) / dirLen + (height * d) / upLen,
    );
    const quad = quadFromPoints([start, end, up, opposite]);
    items.push({
      str: item.str,
      quads: [quad],
      origin: { x: start[0], y: start[1] },
      fontSize: Math.abs(upLen) || Math.abs(dirLen) || 10,
      fontName: item.fontName ?? '',
      dir: item.dir === 'rtl' ? 'rtl' : 'ltr',
      transform: [a, b, c, d, e, f],
    });
    text += item.str;
    if (item.hasEOL) text += '\n';
  }
  const data: SourcePageData = {
    items,
    text,
    width: page.view[2] - page.view[0],
    height: page.view[3] - page.view[1],
    rotation: page.rotate,
  };
  entry.text.set(index, data);
  return data;
}

function quadFromPoints(points: number[][]): Quad {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Searches one page's text and returns match rectangles. Partial matches inside
 * a text run are interpolated proportionally so the highlight lines up.
 */
export function findInPage(
  pageId: string,
  pageIndex: number,
  data: SourcePageData,
  query: string,
  opts: { matchCase?: boolean; wholeWord?: boolean } = {},
): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const needle = opts.matchCase ? query : query.toLowerCase();
  if (!needle) return matches;
  for (const item of data.items) {
    const haystack = opts.matchCase ? item.str : item.str.toLowerCase();
    const indices: number[] = [];
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      if (!opts.wholeWord || isWholeWord(item.str, at, needle.length)) indices.push(at);
      from = at + Math.max(1, needle.length);
    }
    if (!indices.length) continue;
    const quad = item.quads[0];
    for (const at of indices) {
      const startRatio = item.str.length ? at / item.str.length : 0;
      const endRatio = item.str.length ? (at + needle.length) / item.str.length : 1;
      const x = quad.x + quad.w * startRatio;
      const w = Math.max(2, quad.w * (endRatio - startRatio));
      matches.push({
        pageIndex,
        pageId,
        x,
        y: quad.y,
        w,
        h: quad.h,
        text: item.str.slice(at, at + needle.length),
        quads: [{ x, y: quad.y, w, h: quad.h }],
      });
    }
  }
  return matches;
}

function isWholeWord(haystack: string, at: number, length: number): boolean {
  const before = haystack[at - 1] ?? ' ';
  const after = haystack[at + length] ?? ' ';
  return !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
}

/** Normalised page text used for fast full-document search previews. */
export function normalizedPageText(data: SourcePageData): string {
  return normalizeText(data.text);
}

/** Renders a small thumbnail as a data URL (used by the page rail). */
export async function renderThumbnail(source: SourceDoc, index: number, width = 132): Promise<string> {
  const page = await getPageProxy(source, index);
  const base = page.getViewport({ scale: 1, rotation: page.rotate });
  const scale = width / base.width;
  const viewport = page.getViewport({ scale, rotation: page.rotate });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.72);
}

export function hasDocumentLoaded(sourceId: string): boolean {
  return !!entries.get(sourceId)?.proxy;
}
