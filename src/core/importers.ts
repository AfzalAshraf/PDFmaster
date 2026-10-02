/**
 * Turning arbitrary user files into PDF "source documents".
 *
 * Supported: PDF (kept as-is), images (PNG/JPEG/WebP/GIF/BMP), plain text,
 * Markdown, CSV/TSV, HTML, JSON/XML — and best-effort text extraction from
 * Office files (DOCX/XLSX/PPTX) so they can be annotated and re-exported.
 * Nothing leaves the browser.
 */
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, hexToRgb, registerFontkit } from './pdflib';
import type { SourceDoc } from './types';
import { uid, sanitizeFilename } from './utils';

export interface ImportResult {
  source: SourceDoc;
  warnings: string[];
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;

export async function fileToSource(file: File | Blob, name?: string, password?: string): Promise<ImportResult> {
  const filename = name ?? (file instanceof File ? file.name : 'document.pdf');
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const warnings: string[] = [];

  if (ext === 'pdf' || (bytes[0] === 0x25 && bytes[1] === 0x50)) {
    return { source: await sourceFromPdfBytes(bytes, filename, password), warnings };
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(ext)) {
    const { pdf, warning } = await imageToPdfBytes(file, filename);
    if (warning) warnings.push(warning);
    return { source: await sourceFromPdfBytes(pdf, filename.replace(/\.[^.]+$/, '') + '.pdf'), warnings };
  }
  if (['txt', 'md', 'markdown', 'csv', 'tsv', 'log', 'json', 'xml', 'html', 'htm'].includes(ext)) {
    const text = await file.text();
    const blocks = textFileToBlocks(text, ext);
    const pdf = await textBlocksToPdf(filename, blocks);
    return { source: await sourceFromPdfBytes(pdf, filename.replace(/\.[^.]+$/, '') + '.pdf'), warnings };
  }
  if (ext === 'docx') {
    const text = await docxToText(bytes);
    warnings.push('Word files are converted text-first (formatting is not carried over).');
    const pdf = await textBlocksToPdf(filename, [{ kind: 'body', text }]);
    return { source: await sourceFromPdfBytes(pdf, filename.replace(/\.[^.]+$/, '') + '.pdf'), warnings };
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const rows = await xlsxToRows(bytes);
    warnings.push('Spreadsheets are converted to one PDF page per sheet.');
    const pdf = await textBlocksToPdf(
      filename,
      rows.map((sheet) => ({ kind: 'table' as const, text: sheet.name, rows: sheet.rows })),
    );
    return { source: await sourceFromPdfBytes(pdf, filename.replace(/\.[^.]+$/, '') + '.pdf'), warnings };
  }
  if (ext === 'pptx') {
    const slides = await pptxToSlides(bytes);
    warnings.push('Presentations are converted to one PDF page per slide (text only).');
    const pdf = await textBlocksToPdf(
      filename,
      slides.map((slide, i) => ({ kind: 'slide' as const, text: slide, title: `Slide ${i + 1}` })),
    );
    return { source: await sourceFromPdfBytes(pdf, filename.replace(/\.[^.]+$/, '') + '.pdf'), warnings };
  }
  throw new Error(`Unsupported file type: .${ext || 'unknown'}`);
}

async function sourceFromPdfBytes(bytes: Uint8Array, name: string, password?: string): Promise<SourceDoc> {
  // Parse it once here so a broken/encrypted file fails fast with a clear error.
  let pageCount = 0;
  try {
    const doc = await PDFDocument.load(bytes, { password, ignoreEncryption: !password, throwOnInvalidObject: false });
    pageCount = doc.getPageCount();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/encrypted|password/i.test(message)) throw new Error('This PDF is password protected.');
    throw new Error(`Could not open ${name}: ${message}`);
  }
  if (!pageCount) throw new Error(`${name} has no pages.`);
  return {
    id: uid('src'),
    name,
    bytes,
    pageCount,
    size: bytes.byteLength,
    loadedAt: Date.now(),
    password,
  };
}

/** Creates a blank document of the given page size. */
export async function blankSource(size: [number, number] = A4, count = 1): Promise<SourceDoc> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage(size);
  const bytes = await doc.save({ useObjectStreams: true });
  return {
    id: uid('src'),
    name: `Blank ${Math.round(size[0])}×${Math.round(size[1])}pt`,
    bytes,
    pageCount: count,
    size: bytes.byteLength,
    loadedAt: Date.now(),
    blank: true,
  };
}

async function imageToPdfBytes(file: Blob, filename: string): Promise<{ pdf: Uint8Array; warning?: string }> {
  let bytes: Uint8Array<ArrayBufferLike> = new Uint8Array(await file.arrayBuffer());
  let mime = file.type || guessMime(filename);
  let warning: string | undefined;
  if (!['image/png', 'image/jpeg'].includes(mime)) {
    const converted = await rasteriseToPng(file);
    bytes = converted;
    mime = 'image/png';
    warning = 'The image was re-encoded as PNG (lossless) for placement.';
  }
  const doc = await PDFDocument.create();
  const image = mime === 'image/jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const w = image.width * scale;
  const h = image.height * scale;
  const page = doc.addPage([w, h]);
  page.drawImage(image, { x: 0, y: 0, width: w, height: h });
  void hexToRgb;
  return { pdf: await doc.save(), warning };
}

function guessMime(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

/** Converts any browser-decodable image into PNG bytes via a canvas. */
export async function rasteriseToPng(blob: Blob, maxSide = 4000): Promise<Uint8Array> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('The image could not be decoded.'));
      img.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
    if (!out) throw new Error('The image could not be converted.');
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ------------------------------------------------------------------ */
/* text-ish formats                                                   */
/* ------------------------------------------------------------------ */

export type ContentBlock =
  | { kind: 'body'; text: string; title?: string }
  | { kind: 'table'; text: string; rows: string[][] }
  | { kind: 'slide'; text: string; title?: string };

function textFileToBlocks(text: string, ext: string): ContentBlock[] {
  if (ext === 'csv' || ext === 'tsv') {
    const delim = ext === 'tsv' ? '\t' : ',';
    const rows = parseDelimited(text, delim);
    return [{ kind: 'table', text: 'Data', rows }];
  }
  if (ext === 'html' || ext === 'htm') {
    const plain = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    return [{ kind: 'body', text: plain.replace(/\n{3,}/g, '\n\n') }];
  }
  if (ext === 'md' || ext === 'markdown') {
    return [{ kind: 'body', text: text.replace(/[#*_`>]/g, '') }];
  }
  return [{ kind: 'body', text }];
}

export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.slice(0, 2000);
}

/**
 * Lays out plain content into a PDF using real text metrics (Helvetica), with
 * page breaks, titles and monospaced tables.
 */
export async function textBlocksToPdf(filename: string, blocks: ContentBlock[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  registerFontkit(doc);
  const body = doc.embedStandardFont(StandardFonts.Helvetica);
  const bold = doc.embedStandardFont(StandardFonts.HelveticaBold);
  const mono = doc.embedStandardFont(StandardFonts.Courier);
  doc.setTitle(sanitizeFilename(filename));
  doc.setProducer('PDFmaster 1.0');

  const pageWidth = A4[0];
  const pageHeight = A4[1];
  const usable = pageWidth - MARGIN * 2;
  let page = doc.addPage(A4);
  let cursor = pageHeight - MARGIN;

  const newPage = () => {
    page = doc.addPage(A4);
    cursor = pageHeight - MARGIN;
  };
  const ensure = (needed: number) => {
    if (cursor - needed < MARGIN) newPage();
  };

  const drawWrapped = (text: string, opts: { size: number; font: typeof body; leading: number; indent?: number }) => {
    const indent = opts.indent ?? 0;
    for (const paragraph of text.split('\n')) {
      if (!paragraph.trim()) {
        cursor -= opts.leading * 0.6;
        continue;
      }
      const words = paragraph.split(/\s+/);
      let line = '';
      const flush = () => {
        ensure(opts.leading);
        page.drawText(line, { x: MARGIN + indent, y: cursor - opts.size, size: opts.size, font: opts.font });
        cursor -= opts.leading;
        line = '';
      };
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (opts.font.widthOfTextAtSize(candidate, opts.size) > usable - indent && line) flush();
        else line = candidate;
      }
      if (line) flush();
    }
  };

  for (const block of blocks) {
    if (block.kind === 'body') {
      if (block.title) {
        ensure(26);
        drawWrapped(block.title, { size: 16, font: bold, leading: 22 });
        cursor -= 4;
      }
      drawWrapped(block.text, { size: 10.5, font: body, leading: 15 });
    } else if (block.kind === 'slide') {
      ensure(30);
      drawWrapped(block.title ?? 'Slide', { size: 18, font: bold, leading: 24 });
      cursor -= 6;
      drawWrapped(block.text, { size: 12, font: body, leading: 18, indent: 6 });
      cursor -= 16;
    } else {
      const columns = Math.max(...block.rows.map((r) => r.length), 1);
      const colWidth = usable / columns;
      ensure(24);
      drawWrapped(block.text, { size: 14, font: bold, leading: 20 });
      for (const [rowIndex, row] of block.rows.entries()) {
        ensure(13);
        for (let c = 0; c < columns; c++) {
          const raw = row[c] ?? '';
          const maxChars = Math.max(4, Math.floor(colWidth / 5.4));
          const cell = raw.length > maxChars ? `${raw.slice(0, maxChars - 1)}…` : raw;
          page.drawText(cell, {
            x: MARGIN + c * colWidth,
            y: cursor - 9,
            size: 9,
            font: rowIndex === 0 ? bold : mono,
            color: hexToRgb(rowIndex === 0 ? '#111111' : '#333333'),
          });
        }
        page.drawLine({
          start: { x: MARGIN, y: cursor - 12 },
          end: { x: pageWidth - MARGIN, y: cursor - 12 },
          thickness: rowIndex === 0 ? 0.8 : 0.3,
          color: hexToRgb(rowIndex === 0 ? '#888888' : '#dddddd'),
        });
        cursor -= 14;
      }
      cursor -= 10;
    }
  }
  return doc.save({ useObjectStreams: true });
}

/* ------------------------------------------------------------------ */
/* OOXML (best-effort text extraction)                                */
/* ------------------------------------------------------------------ */

export async function docxToText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('Not a valid .docx file.');
  const paragraphs: string[] = [];
  for (const paragraph of xml.split(/<w:p[ >]/).slice(1)) {
    const text = [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => decodeXml(m[1])).join('');
    paragraphs.push(text);
  }
  return paragraphs.join('\n').replace(/\n{3,}/g, '\n\n');
}

export async function xlsxToRows(bytes: Uint8Array): Promise<{ name: string; rows: string[][] }[]> {
  const zip = await JSZip.loadAsync(bytes);
  const shared: string[] = [];
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  if (sharedXml) {
    for (const m of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join(''));
    }
  }
  const sheets: { name: string; rows: string[][] }[] = [];
  const files = Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
  for (const [i, file] of files.sort().entries()) {
    const xml = await zip.file(file)!.async('string');
    const rows: string[][] = [];
    for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cellMatch[1];
        const inner = cellMatch[2];
        const valueMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        const inlineMatch = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/);
        let value = '';
        if (inlineMatch) value = decodeXml(inlineMatch[1]);
        else if (valueMatch) {
          const raw = decodeXml(valueMatch[1]);
          value = /t="s"/.test(attrs) ? (shared[parseInt(raw, 10)] ?? '') : raw;
        }
        row.push(value);
      }
      rows.push(row);
      if (rows.length > 500) break;
    }
    sheets.push({ name: `Sheet ${i + 1}`, rows: rows.filter((r) => r.some((c) => c !== '')) });
  }
  if (!sheets.length) throw new Error('Not a valid .xlsx file.');
  return sheets;
}

export async function pptxToSlides(bytes: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  const files = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/(\d+)/)![1]) - Number(b.match(/(\d+)/)![1]));
  const slides: string[] = [];
  for (const file of files) {
    const xml = await zip.file(file)!.async('string');
    const lines = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1]));
    slides.push(lines.join('\n'));
  }
  if (!slides.length) throw new Error('Not a valid .pptx file.');
  return slides;
}

function decodeXml(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '');
}
