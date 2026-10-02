import fontkit from '@pdf-lib/fontkit';
import {
  BlendMode,
  LineCapStyle,
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  degrees,
  rgb,
  type RGB,
} from '@cantoo/pdf-lib';
import { parseColor } from './geometry';
import type { TextStyle } from './types';

export {
  BlendMode,
  LineCapStyle,
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  degrees,
  rgb,
  fontkit,
};
export type { RGB };
export * as pdfLib from '@cantoo/pdf-lib';

const fontkitRegistered = new WeakSet<PDFDocument>();

export function registerFontkit(doc: PDFDocument): void {
  if (fontkitRegistered.has(doc)) return;
  doc.registerFontkit(fontkit);
  fontkitRegistered.add(doc);
}

export const hexToRgb = (hex: string): RGB => {
  const [r, g, b] = parseColor(hex);
  return rgb(r, g, b);
};

const STANDARD_FONT_MAP: Record<string, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica,
  'Helvetica-Bold': StandardFonts.HelveticaBold,
  'Helvetica-Oblique': StandardFonts.HelveticaOblique,
  'Helvetica-BoldOblique': StandardFonts.HelveticaBoldOblique,
  'Times-Roman': StandardFonts.TimesRoman,
  'Times-Bold': StandardFonts.TimesRomanBold,
  'Times-Italic': StandardFonts.TimesRomanItalic,
  'Times-BoldItalic': StandardFonts.TimesRomanBoldItalic,
  Courier: StandardFonts.Courier,
  'Courier-Bold': StandardFonts.CourierBold,
  'Courier-Oblique': StandardFonts.CourierOblique,
  'Courier-BoldOblique': StandardFonts.CourierBoldOblique,
};

/** Resolve a font family + weight/slant to a standard-14 font name. */
export function standardFontName(style: Pick<TextStyle, 'fontFamily' | 'bold' | 'italic'>): string {
  const family = style.fontFamily || 'Helvetica';
  const isTimes = family.startsWith('Times');
  const isCourier = family.startsWith('Courier');
  let name: string;
  if (isTimes) name = style.italic ? 'Times-Italic' : 'Times-Roman';
  else if (isCourier) name = style.italic ? 'Courier-Oblique' : 'Courier';
  else name = style.italic ? 'Helvetica-Oblique' : 'Helvetica';
  if (style.bold) {
    if (isTimes) name = style.italic ? 'Times-BoldItalic' : 'Times-Bold';
    else if (isCourier) name = style.italic ? 'Courier-BoldOblique' : 'Courier-Bold';
    else name = style.italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold';
  }
  return name;
}

const fontCache = new WeakMap<PDFDocument, Map<string, PDFFont>>();

export function embedStandardFont(doc: PDFDocument, name: string): PDFFont {
  let cache = fontCache.get(doc);
  if (!cache) {
    cache = new Map();
    fontCache.set(doc, cache);
  }
  const cached = cache.get(name);
  if (cached) return cached;
  const standard = STANDARD_FONT_MAP[name] ?? StandardFonts.Helvetica;
  const font = doc.embedStandardFont(standard);
  cache.set(name, font);
  return font;
}

/**
 * True when every character can be encoded by the standard-14 WinAnsi fonts.
 * Anything else needs an embedded TrueType font.
 */
export function isWinAnsiSafe(text: string): boolean {
  return /^[\u0000-\u00ff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]*$/.test(
    text,
  );
}

export type EmbeddedFontResolver = (
  doc: PDFDocument,
  family: string,
  bold?: boolean,
  italic?: boolean,
) => PDFFont | undefined;

let embeddedResolver: EmbeddedFontResolver | undefined;

/** Registered by `fonts.ts`; keeps this module free of a circular import. */
export function setEmbeddedFontResolver(fn: EmbeddedFontResolver): void {
  embeddedResolver = fn;
}

export function canEmbedFonts(): boolean {
  return embeddedResolver !== undefined;
}

/**
 * Picks the right font for a text style. Embedded DejaVu is used when the text
 * cannot be encoded by the standard fonts, or when `embed` is requested (PDF/A).
 */
export function fontForStyle(
  doc: PDFDocument,
  style: Pick<TextStyle, 'fontFamily' | 'bold' | 'italic'>,
  text?: string,
  opts?: { embed?: boolean },
): PDFFont {
  const needsEmbedded = !!opts?.embed || (!!text && !isWinAnsiSafe(text));
  if (needsEmbedded) {
    const embedded = embeddedResolver?.(doc, style.fontFamily || 'Helvetica', style.bold, style.italic);
    if (embedded) return embedded;
  }
  return embedStandardFont(doc, standardFontName(style));
}

/**
 * pdf-lib's standard fonts are WinAnsi encoded: guarantee the string can be
 * encoded (dropping anything outside the set, which would otherwise throw).
 */
export function sanitizeForStandardFont(text: string, font: PDFFont): string {
  let out = '';
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += fallbackChar(ch);
    }
  }
  return out;
}

function fallbackChar(ch: string): string {
  if (/[\u2018\u2019\u201b\u2032]/.test(ch)) return "'";
  if (/[\u201c\u201d\u2033]/.test(ch)) return '"';
  if (ch === '\u2013' || ch === '\u2014') return '-';
  if (ch === '\u2026') return '...';
  if (ch === '\u00a0') return ' ';
  if (ch === '\t') return '    ';
  if (ch === '\u2022') return '-';
  return '?';
}

/** Word-wrap a string to a max width (points) using real font metrics. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    const words = paragraph.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      const candidate = line + word;
      const width = font.widthOfTextAtSize(candidate, size);
      if (width > maxWidth && line.trim()) {
        lines.push(line.replace(/\s+$/, ''));
        line = word.replace(/^\s+/, '');
      } else {
        line = candidate;
      }
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines;
}

export function loadPdf(bytes: Uint8Array, password?: string): Promise<PDFDocument> {
  return PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
    password,
    throwOnInvalidObject: false,
  });
}

export function createPdf(): Promise<PDFDocument> {
  return PDFDocument.create({ updateMetadata: false });
}
