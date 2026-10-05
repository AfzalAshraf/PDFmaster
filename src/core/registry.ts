/**
 * Runtime registry that owns the pdf.js documents.
 *
 * pdf.js objects are heavy and cannot live in the (serialisable) editor store,
 * so they are cached here, keyed by source document id, and pages are rendered
 * on demand. Text content is extracted once per page and cached for search,
 * text editing and the Office/Markdown exports.
 */
import { openDocument, type PdfDocumentProxy, type PdfPageProxy } from './pdfjs';
import { hasPdfHeader, normalizePdfBytes } from './pdfbytes';
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
  if (entry.proxy) {
    void healSourceBytes(source, entry.proxy);
    return entry.proxy;
  }
  if (!entry.loading) {
    const bytes = normalizePdfBytes(source.bytes);
    entry.loading = openDocument(bytes, { password: source.password })
      .then((proxy) => {
        entry.proxy = proxy;
        void healSourceBytes(source, proxy);
        return proxy;
      })
      .catch((err) => {
        entry.loading = undefined;
        throw err;
      });
  }
  return entry.loading;
}

/**
 * The viewer can still hold the file after the store's buffer was transferred
 * to the pdf.js worker. Copy it back so export and print can read a real PDF.
 */
export async function recoverSourceBytes(source: SourceDoc): Promise<Uint8Array | null> {
  const direct = normalizePdfBytes(source.bytes);
  if (hasPdfHeader(direct)) {
    source.bytes = direct;
    source.size = direct.byteLength;
    return direct;
  }
  try {
    const proxy = await getDocumentProxy(source);
    const recovered = normalizePdfBytes(await proxy.getData());
    if (!hasPdfHeader(recovered)) return null;
    source.bytes = recovered;
    source.size = recovered.byteLength;
    return recovered;
  } catch {
    return null;
  }
}

async function healSourceBytes(source: SourceDoc, proxy: PdfDocumentProxy): Promise<void> {
  if (hasPdfHeader(normalizePdfBytes(source.bytes))) return;
  try {
    const recovered = normalizePdfBytes(await proxy.getData());
    if (!hasPdfHeader(recovered)) return;
    source.bytes = recovered;
    source.size = recovered.byteLength;
  } catch {
    /* the next export will try again */
  }
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

/**
 * pdf.js `getTextContent()` transforms are already in PDF user space (the same
 * coordinates `drawText` uses). Treating them as viewport points and converting
 * "back" places every run in the wrong place, so search highlights miss and
 * in-place edits fail to find the content-stream operator.
 */
export function geometryFromTextItem(item: { transform: number[]; width?: number; height?: number }): {
  origin: { x: number; y: number };
  quad: Quad;
  fontSize: number;
} {
  const [a, b, c, d, e, f] = item.transform;
  const width = item.width ?? 0;
  const height = item.height ?? (Math.hypot(c, d) || Math.hypot(a, b) || 10);
  const dirLen = Math.hypot(a, b) || 1;
  const upLen = Math.hypot(c, d) || height || 1;
  const endX = e + (width * a) / dirLen;
  const endY = f + (width * b) / dirLen;
  const upX = e + (height * c) / upLen;
  const upY = f + (height * d) / upLen;
  const quad = quadFromPoints([
    [e, f],
    [endX, endY],
    [upX, upY],
    [endX + (upX - e), endY + (upY - f)],
  ]);
  return {
    origin: { x: e, y: f },
    quad,
    fontSize: Math.max(1, upLen || dirLen || height),
  };
}

/** Text content of a page, converted into PDF user space (cached). */
export async function getPageTextData(source: SourceDoc, index: number): Promise<SourcePageData> {
  const entry = entryFor(source.id);
  const cached = entry.text.get(index);
  if (cached) return cached;
  const page = await getPageProxy(source, index);
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  let text = '';
  for (const raw of content.items) {
    const item = raw as { str?: string; transform?: number[]; width?: number; height?: number; fontName?: string; dir?: string; hasEOL?: boolean };
    if (!item.str || !item.transform) {
      if ((item as { hasEOL?: boolean }).hasEOL) text += '\n';
      continue;
    }
    const transform = item.transform;
    const [a, b, c, d, e, f] = transform;
    const geo = geometryFromTextItem({ ...item, transform });
    items.push({
      str: item.str,
      quads: [geo.quad],
      origin: geo.origin,
      fontSize: geo.fontSize,
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
      const snippetStart = Math.max(0, at - 18);
      const snippetEnd = Math.min(item.str.length, at + needle.length + 18);
      matches.push({
        pageIndex,
        pageId,
        x,
        y: quad.y,
        w,
        h: quad.h,
        text: item.str.slice(at, at + needle.length),
        itemIndex: data.items.indexOf(item),
        snippet: item.str.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ').trim(),
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
export async function renderThumbnail(source: SourceDoc, index: number, width = 132, rotation?: number): Promise<string> {
  const page = await getPageProxy(source, index);
  const rot = ((rotation ?? page.rotate) % 360 + 360) % 360;
  const base = page.getViewport({ scale: 1, rotation: rot });
  const scale = width / base.width;
  const viewport = page.getViewport({ scale, rotation: rot });
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
