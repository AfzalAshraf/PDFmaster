/**
 * Font handling.
 *
 * PDF viewers know the "standard 14" fonts without embedding them, so by default
 * we use them — that keeps exported files small. Standard fonts can only encode
 * WinAnsi characters though, and PDF/A requires embedded fonts, so in those
 * cases we transparently switch to DejaVu: it ships with the app and covers
 * Latin, Greek, Cyrillic, Hebrew, Arabic and more.
 *
 * The files are ~750 KB each, so they are fetched lazily and cached forever by
 * the service worker (they are never part of the critical bundle).
 */
import type { PDFDocument, PDFFont } from './pdflib';
import { isWinAnsiSafe, setEmbeddedFontResolver } from './pdflib';
import type { TextStyle } from './types';

export type FontKey =
  | 'sans'
  | 'sans-bold'
  | 'sans-italic'
  | 'sans-bolditalic'
  | 'serif'
  | 'serif-bold'
  | 'serif-italic'
  | 'serif-bolditalic';

const FILES: Record<FontKey, string> = {
  sans: 'DejaVuSans.ttf',
  'sans-bold': 'DejaVuSans-Bold.ttf',
  'sans-italic': 'DejaVuSans-Oblique.ttf',
  'sans-bolditalic': 'DejaVuSans-BoldOblique.ttf',
  serif: 'DejaVuSerif.ttf',
  'serif-bold': 'DejaVuSerif-Bold.ttf',
  'serif-italic': 'DejaVuSerif-Italic.ttf',
  'serif-bolditalic': 'DejaVuSerif-BoldItalic.ttf',
};

/** Files that must be present before a run that needs embedding can be painted. */
export const SANS_KEYS: FontKey[] = ['sans', 'sans-bold', 'sans-italic', 'sans-bolditalic'];
export const SERIF_KEYS: FontKey[] = ['serif', 'serif-bold', 'serif-italic', 'serif-bolditalic'];

export function familyIsSerif(fontFamily: string | undefined): boolean {
  return /times|serif|georgia|garamond/i.test(fontFamily ?? '');
}

export interface FontMeta {
  serif: boolean;
  bold: boolean;
  italic: boolean;
}

const SERIF_HINTS = /times|tms|serif|georgia|garamond|palatino|bookman|bodoni|baskerville|song|simsun|ming|nsim|stsong|cambria|freeserif/i;
const SANS_HINTS = /arial|helvetica|sans|verdana|tahoma|segoe|calibri|roboto|lato|open sans|freesans|carlito|caladea|pt sans/i;
const BOLD_HINTS = /bold|black|heavy|semibold|demi|extrabold|ultrabold/i;
const ITALIC_HINTS = /italic|oblique/i;

/**
 * Best-effort parse of font metadata out of a font name.
 *
 * Handles BaseFont names ("Times-Bold", "ArialMT"), subsetting prefixes
 * ("ABCDEF+Arial-BoldMT") and pdf.js font names ("Helv", "F1" — the latter
 * simply yields the neutral default). Nothing here is authoritative; it only
 * steers the choice of replacement font when an edit is re-painted.
 */
export function parseFontMeta(name: string | undefined): FontMeta {
  const clean = (name ?? '').replace(/^[A-Z]{6}\+/i, '').replace(/^\//, '');
  const serif = SERIF_HINTS.test(clean) && !SANS_HINTS.test(clean);
  const bold = BOLD_HINTS.test(clean) && !/light|thin|book\b/i.test(clean);
  const italic = ITALIC_HINTS.test(clean);
  return { serif, bold, italic };
}

export function fontKeyFor(serif: boolean, bold?: boolean, italic?: boolean): FontKey {
  const family = serif ? 'serif' : 'sans';
  if (bold && italic) return `${family}-bolditalic` as FontKey;
  if (bold) return `${family}-bold` as FontKey;
  if (italic) return `${family}-italic` as FontKey;
  return family as FontKey;
}

/**
 * Which embedded font (if any) a run needs.
 * Returns null when one of the standard 14 fonts will do.
 */
export function neededFontKey(style: Pick<TextStyle, 'fontFamily' | 'bold' | 'italic'>, text: string, embed: boolean): FontKey | null {
  if (!embed && isWinAnsiSafe(text)) return null;
  return fontKeyFor(familyIsSerif(style.fontFamily), style.bold, style.italic);
}

const bytes = new Map<FontKey, Uint8Array | null>();
const inflight = new Map<FontKey, Promise<Uint8Array | null>>();
const embedded = new WeakMap<PDFDocument, Map<FontKey, PDFFont>>();

function fontUrl(file: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${base}/fonts/${file}`;
}

export async function loadFontBytes(key: FontKey): Promise<Uint8Array | null> {
  if (bytes.has(key)) return bytes.get(key) ?? null;
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = (async () => {
    try {
      const response = await fetch(fontUrl(FILES[key]));
      if (!response.ok) throw new Error(String(response.status));
      const data = new Uint8Array(await response.arrayBuffer());
      bytes.set(key, data);
      return data;
    } catch {
      bytes.set(key, null);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, request);
  return request;
}

/** Loads the bytes for a set of keys without embedding them yet. */
export async function preloadFontKeys(keys: FontKey[]): Promise<void> {
  await Promise.all(keys.map((key) => loadFontBytes(key)));
}

/**
 * Embeds (once per document) the DejaVu font for a style and returns it.
 * Returns null when the font files are unavailable — callers then fall back to
 * a standard font and sanitise the text.
 */
export async function embedFont(doc: PDFDocument, key: FontKey): Promise<PDFFont | null> {
  let perDoc = embedded.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    embedded.set(doc, perDoc);
  }
  const existing = perDoc.get(key);
  if (existing) return existing;
  const data = await loadFontBytes(key);
  if (!data) return null;
  try {
    const font = await doc.embedFont(data, { subset: true });
    perDoc.set(key, font);
    return font;
  } catch {
    return null;
  }
}

/** Synchronous lookup for fonts embedded earlier by {@link embedFont}. */
export function embeddedFontSync(doc: PDFDocument, key: FontKey): PDFFont | null {
  return embedded.get(doc)?.get(key) ?? null;
}

/** Pre-embeds everything the drawing pass will need, so painting stays synchronous. */
export async function prepareFonts(doc: PDFDocument, keys: FontKey[]): Promise<void> {
  await Promise.all(Array.from(new Set(keys)).map((key) => embedFont(doc, key)));
}

export async function preloadFonts(): Promise<void> {
  await preloadFontKeys(SANS_KEYS);
}

/**
 * Bridges `pdflib.fontForStyle` to this module: when the drawing code asks for a
 * font for a Unicode run, it gets the already-embedded DejaVu face if we
 * prepared it.
 */
setEmbeddedFontResolver((doc, family, bold, italic) =>
  embeddedFontSync(doc, fontKeyFor(familyIsSerif(family), bold, italic)) ?? undefined,
);

export const FONT_FILES = FILES;
export { isWinAnsiSafe };
