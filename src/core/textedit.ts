/**
 * Low level PDF content-stream editing, built on the public literal-operand
 * parser (`parseContentStream`) so no pdf-lib internals are touched.
 *
 * Two production features are built on this module:
 *  - **Edit text**: rewrites the `Tj` / `TJ` operand in place, preserving font,
 *    size, colour and position. When the replacement cannot be encoded with the
 *    original font, the run is blanked and re-painted with an embedded font.
 *  - **Redaction**: deletes the text runs (and fully covered images) inside a
 *    redaction area — the characters are removed from the file, not just hidden.
 */
import { PDFDocument, PDFPage, pdfLib } from './pdflib';
import type { Rect, TextEditOp } from './types';
import { normalizeText } from './utils';

type Operand = pdfLib.ContentStreamOperand;
type Op = pdfLib.ContentStreamOperation;
type LiteralString = pdfLib.LiteralStringOperand;
type HexString = pdfLib.HexStringOperand;

const IDENTITY6 = [1, 0, 0, 1, 0, 0];

export interface PaintedText {
  text: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

export interface EditResult {
  applied: number;
  failed: number;
}

export interface RedactResult {
  removedTextRuns: number;
  removedXObjects: number;
}

/* ------------------------------------------------------------------ */
/* operand helpers                                                    */
/* ------------------------------------------------------------------ */

const isName = (o: Operand): o is pdfLib.NameOperand =>
  typeof o === 'object' && o !== null && !Array.isArray(o) && (o as { type?: string }).type === 'name';

const isString = (o: Operand): o is LiteralString | HexString =>
  typeof o === 'object' &&
  o !== null &&
  !Array.isArray(o) &&
  ((o as { type?: string }).type === 'string' || (o as { type?: string }).type === 'hexString');

const asBytes = (o: Operand): Uint8Array | undefined => (isString(o) ? o.bytes : undefined);

/** WinAnsi/Latin-1 decode of a string operand (matches the font's simple encoding). */
export function decodeOperandText(o: Operand): string {
  const bytes = asBytes(o);
  if (!bytes) return '';
  let out = '';
  for (const byte of bytes) {
    if (byte >= 0x20) out += String.fromCharCode(byte);
    else if (byte === 0x0a || byte === 0x0d || byte === 0x09) out += ' ';
  }
  return out;
}

function encodeTextOperand(text: string): LiteralString {
  const ascii = text.replace(/[^\x20-\x7e]/g, '?');
  const bytes = new Uint8Array(ascii.length);
  for (let i = 0; i < ascii.length; i++) bytes[i] = ascii.charCodeAt(i) & 0xff;
  return { type: 'string', bytes };
}

function serializeOperand(o: Operand): string | null {
  if (typeof o === 'number') return Number.isFinite(o) ? String(Math.round(o * 1e6) / 1e6) : '0';
  if (typeof o === 'string') return `/${escapeName(o)}`;
  if (typeof o === 'boolean') return o ? 'true' : 'false';
  if (o === null || o === undefined) return 'null';
  if (Array.isArray(o)) {
    const parts = o.map(serializeOperand);
    if (parts.some((p) => p === null)) return null;
    return `[ ${parts.join(' ')} ]`;
  }
  const obj = o as { type?: string; value?: string; bytes?: Uint8Array } & Record<string, Operand>;
  if (obj.type === 'name') return `/${escapeName(obj.value ?? '')}`;
  if (obj.type === 'hexString') return `<${bytesToHex(obj.bytes ?? new Uint8Array())}>`;
  if (obj.type === 'string') return `(${escapeLiteral(obj.bytes ?? new Uint8Array())})`;
  // dictionary
  const entries: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const serialized = serializeOperand(value as Operand);
    if (serialized === null) return null;
    entries.push(`/${escapeName(key)} ${serialized}`);
  }
  return `<< ${entries.join(' ')} >>`;
}

const escapeName = (name: string) => name.replace(/[^\x21-\x7e]/g, (c) => `#${c.charCodeAt(0).toString(16).padStart(2, '0')}`);

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

function escapeLiteral(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    if (byte === 0x28) out += '\\(';
    else if (byte === 0x29) out += '\\)';
    else if (byte === 0x5c) out += '\\\\';
    else if (byte < 0x20 || byte > 0x7e) out += `\\${byte.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(byte);
  }
  return out;
}

function serializeOps(ops: Op[]): string | null {
  const lines: string[] = [];
  for (const op of ops) {
    const args = op.args.map(serializeOperand);
    if (args.some((a) => a === null)) return null;
    lines.push(args.length ? `${args.join(' ')} ${op.name}` : op.name);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* read / write                                                       */
/* ------------------------------------------------------------------ */

export function readPageContentOps(doc: PDFDocument, page: PDFPage): Op[] {
  const contents = page.node.Contents();
  if (!contents) return [];
  const direct = doc.context.lookup(contents);
  const streams: unknown[] = [];
  if (direct instanceof pdfLib.PDFArray) {
    for (let i = 0; i < direct.size(); i++) streams.push(direct.lookup(i));
  } else {
    streams.push(direct);
  }
  const ops: Op[] = [];
  for (const stream of streams) {
    try {
      ops.push(...streamToOps(stream));
    } catch {
      /* unparsable stream: keep going, edits on it will be reported as failed */
    }
  }
  return ops;
}

function streamToOps(stream: unknown): Op[] {
  if (!stream) return [];
  if (stream instanceof pdfLib.PDFContentStream) {
    return pdfLib.parseContentStream(stream.getUnencodedContents());
  }
  if (stream instanceof pdfLib.PDFRawStream) {
    const decoded = pdfLib.decodePDFRawStream(stream).decode();
    return pdfLib.parseContentStream(decoded);
  }
  return [];
}

/**
 * Replaces the page content with a single fresh stream. Concatenating the
 * ContentStreams of a page is safe (the graphics state is continuous), and it
 * lets us drop the originals so the file does not carry both versions.
 */
export function writePageContentOps(doc: PDFDocument, page: PDFPage, ops: Op[]): boolean {
  const text = serializeOps(ops);
  if (text === null) return false;
  const previous = page.node.Contents();
  const oldRefs: pdfLib.PDFRef[] = [];
  if (previous) {
    const direct = doc.context.lookup(previous);
    if (direct instanceof pdfLib.PDFArray) {
      for (let i = 0; i < direct.size(); i++) {
        const entry = direct.get(i);
        if (entry instanceof pdfLib.PDFRef) oldRefs.push(entry);
      }
      if (previous instanceof pdfLib.PDFRef) oldRefs.push(previous);
    } else if (previous instanceof pdfLib.PDFRef) {
      oldRefs.push(previous);
    }
  }
  // NOTE: pdf-lib's flateStream() takes the raw *string*; our serialiser only
  // emits ASCII (high bytes are written as octal escapes), so this is lossless.
  const stream = doc.context.flateStream(text);
  const ref = doc.context.register(stream);
  page.node.set(pdfLib.PDFName.of('Contents'), ref);
  for (const old of oldRefs) {
    try {
      doc.context.delete(old);
    } catch {
      /* still referenced elsewhere — leave it alone */
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* geometry helpers                                                   */
/* ------------------------------------------------------------------ */

const mul6 = (m: number[], n: number[]) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const apply6 = (m: number[], x: number, y: number) => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5],
});

function charWidth(ch: string): number {
  if (ch === ' ') return 0.28;
  if (/[ilj.,;:'!|]/.test(ch)) return 0.26;
  if (/[mwMW]/.test(ch)) return 0.86;
  if (/[A-Z]/.test(ch)) return 0.66;
  if (/[0-9]/.test(ch)) return 0.56;
  return 0.52;
}

function estimateWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch);
  return w * fontSize;
}

const rectsOverlap = (a: Rect, b: Rect) =>
  !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);

export function rgbToHex(rgb: [number, number, number]): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

/* ------------------------------------------------------------------ */
/* main entry point                                                   */
/* ------------------------------------------------------------------ */

export function applyPageEdits(
  doc: PDFDocument,
  page: PDFPage,
  edits: TextEditOp[],
  redactions: Rect[],
): { edit: EditResult; redact: RedactResult; paint: PaintedText[] } {
  const out = {
    edit: { applied: 0, failed: 0 },
    redact: { removedTextRuns: 0, removedXObjects: 0 },
  };
  const painted: PaintedText[] = [];
  if (!edits.length && !redactions.length) return { ...out, paint: painted };

  let ops: Op[];
  try {
    ops = readPageContentOps(doc, page);
  } catch {
    return { edit: { applied: 0, failed: edits.length }, redact: out.redact, paint: [] };
  }
  if (!ops.length) return { edit: { applied: 0, failed: edits.length }, redact: out.redact, paint: [] };

  const fill: [number, number, number] = [0, 0, 0];
  const textMatrix = { m: [...IDENTITY6], line: [...IDENTITY6] };
  let leading = 0;
  let fontSize = 12;
  let ctm: number[] = [...IDENTITY6];
  const stack: number[][] = [];

  const pending = new Map(edits.map((e) => [e.id, e]));
  const normEdits = edits.map((e) => ({ edit: e, norm: normalizeText(e.original) }));

  for (const op of ops) {
    const name = op.name;
    switch (name) {
      case 'q':
        stack.push([...ctm]);
        break;
      case 'Q':
        ctm = stack.pop() ?? [...IDENTITY6];
        break;
      case 'cm': {
        const n = nums(op, 6);
        if (n) ctm = mul6(ctm, n);
        break;
      }
      case 'BT':
        textMatrix.m = [...IDENTITY6];
        textMatrix.line = [...IDENTITY6];
        break;
      case 'Tf':
        if (typeof op.args[1] === 'number') fontSize = op.args[1];
        break;
      case 'TL':
        if (typeof op.args[0] === 'number') leading = op.args[0];
        break;
      case 'Tm': {
        const n = nums(op, 6);
        if (n) {
          textMatrix.m = n;
          textMatrix.line = n;
        }
        break;
      }
      case 'Td':
      case 'TD': {
        const n = nums(op, 2);
        if (n) {
          if (name === 'TD') leading = -n[1];
          textMatrix.line = mul6(textMatrix.line, [1, 0, 0, 1, n[0], n[1]]);
          textMatrix.m = [...textMatrix.line];
        }
        break;
      }
      case 'T*':
        textMatrix.line = mul6(textMatrix.line, [1, 0, 0, 1, 0, -leading]);
        textMatrix.m = [...textMatrix.line];
        break;
      case 'g':
        if (typeof op.args[0] === 'number') fill[0] = fill[1] = fill[2] = op.args[0];
        break;
      case 'rg':
        if (op.args.length >= 3 && op.args.every((a) => typeof a === 'number')) {
          fill[0] = op.args[0] as number;
          fill[1] = op.args[1] as number;
          fill[2] = op.args[2] as number;
        }
        break;
      default:
        break;
    }

    if (name !== 'Tj' && name !== 'TJ' && name !== "'" && name !== '"') continue;
    const target = name === "'" || name === '"' ? op.args[op.args.length - 1] : op.args[0];
    const text = isString(target) ? decodeOperandText(target) : arrayText(target);
    if (!text) continue;

    const matrix = mul6(ctm, textMatrix.m);
    const origin = apply6(matrix, 0, 0);
    const scale = Math.hypot(matrix[0], matrix[1]) || 1;
    const renderSize = fontSize * scale;
    const width = estimateWidth(text, renderSize);
    const rect: Rect = {
      x: origin.x - 1,
      y: origin.y - renderSize * 0.3,
      w: width + 2,
      h: renderSize * 1.3,
    };

    /* ---------------------------- redaction ---------------------------- */
    if (redactions.length && redactions.some((r) => rectsOverlap(r, rect))) {
      setShowText(op, '');
      out.redact.removedTextRuns += 1;
      textMatrix.m = mul6(textMatrix.m, [1, 0, 0, 1, estimateWidth(text, fontSize), 0]);
      continue;
    }

    /* --------------------------- text edits ---------------------------- */
    if (normEdits.length) {
      const norm = normalizeText(text);
      const hit = normEdits.find(({ edit, norm: target2 }) => {
        if (!pending.has(edit.id)) return false;
        const textMatches = norm === target2 || norm.includes(target2) || target2.includes(norm);
        // Primary match: baseline origin (encoding independent). Fall back to
        // text equality when the caller could not supply an origin.
        if (edit.origin) {
          const dx = Math.abs(edit.origin.x - origin.x);
          const dy = Math.abs(edit.origin.y - origin.y);
          const tol = Math.max(3, renderSize * 0.6);
          return dx <= tol && dy <= tol && (textMatches || !target2);
        }
        return textMatches;
      });
      if (hit) {
        pending.delete(hit.edit.id);
        const replacement = hit.edit.text;
        const asciiSafe =
          isString(target) && /^[\x20-\x7e]*$/.test(text) && /^[\x20-\x7e]*$/.test(replacement);
        if (asciiSafe) {
          setShowText(op, replacement);
        } else {
          setShowText(op, '');
          painted.push({
            text: replacement,
            x: origin.x,
            y: origin.y,
            size: Math.max(4, renderSize),
            rotation: (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI,
            color: rgbToHex(fill),
            bold: /bold|black|heavy|semibold/i.test(hit.edit.fontName ?? ''),
            italic: /italic|oblique/i.test(hit.edit.fontName ?? ''),
          });
        }
        out.edit.applied += 1;
        textMatrix.m = mul6(textMatrix.m, [1, 0, 0, 1, estimateWidth(text, fontSize), 0]);
        continue;
      }
    }

    textMatrix.m = mul6(textMatrix.m, [1, 0, 0, 1, estimateWidth(text, fontSize), 0]);
  }

  /* ------------------ drop fully redacted XObjects ------------------- */
  if (redactions.length) {
    const boxes = new Map<string, Rect | null>();
    let ctm2: number[] = [...IDENTITY6];
    const stack2: number[][] = [];
    ops = ops.filter((op) => {
      if (op.name === 'q') stack2.push([...ctm2]);
      else if (op.name === 'Q') ctm2 = stack2.pop() ?? [...IDENTITY6];
      else if (op.name === 'cm') {
        const n = nums(op, 6);
        if (n) ctm2 = mul6(ctm2, n);
      }
      if (op.name !== 'Do') return true;
      const arg = op.args[0];
      if (!isName(arg)) return true;
      const key = arg.value;
      if (!boxes.has(key)) boxes.set(key, xobjectBBox(page, key));
      const box = boxes.get(key);
      if (!box) return true;
      const placed = transformRect(box, ctm2);
      if (redactions.some((r) => rectContainsRect(r, placed))) {
        out.redact.removedXObjects += 1;
        return false;
      }
      return true;
    });
  }

  if (out.edit.applied || out.redact.removedTextRuns || out.redact.removedXObjects) {
    if (!writePageContentOps(doc, page, ops)) {
      out.edit.applied = 0;
      out.redact.removedTextRuns = 0;
      out.redact.removedXObjects = 0;
      painted.length = 0;
    }
  }
  out.edit.failed = pending.size;
  return { edit: out.edit, redact: out.redact, paint: painted };
}

function setShowText(op: Op, text: string): void {
  const encoded = encodeTextOperand(text);
  if (op.name === "'" || op.name === '"') {
    op.args[op.args.length - 1] = encoded;
    return;
  }
  op.args = [encoded];
  op.name = 'Tj';
}

function arrayText(o: Operand): string {
  if (!Array.isArray(o)) return '';
  let out = '';
  for (const item of o) {
    if (isString(item)) out += decodeOperandText(item);
  }
  return out;
}

function nums(op: Op, count: number): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const v = op.args[i];
    if (typeof v !== 'number') return null;
    out.push(v);
  }
  return out;
}

function xobjectBBox(page: PDFPage, name: string): Rect | null {
  try {
    const resources = page.node.Resources();
    const xobjects = resources?.lookup(pdfLib.PDFName.of('XObject'), pdfLib.PDFDict);
    if (!xobjects) return null;
    const entry = xobjects.lookup(pdfLib.PDFName.of(name.startsWith('/') ? name.slice(1) : name));
    if (!(entry instanceof pdfLib.PDFDict)) return null;
    const bbox = entry.lookup(pdfLib.PDFName.of('BBox'), pdfLib.PDFArray);
    if (!bbox || bbox.size() < 4) return null;
    const v = [0, 1, 2, 3].map((i) => {
      const n = bbox.lookup(i);
      return n instanceof pdfLib.PDFNumber ? n.asNumber() : 0;
    });
    return { x: v[0], y: v[1], w: v[2] - v[0], h: v[3] - v[1] };
  } catch {
    return null;
  }
}

function transformRect(rect: Rect, m: number[]): Rect {
  const pts = [
    apply6(m, rect.x, rect.y),
    apply6(m, rect.x + rect.w, rect.y),
    apply6(m, rect.x + rect.w, rect.y + rect.h),
    apply6(m, rect.x, rect.y + rect.h),
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

function rectContainsRect(outer: Rect, inner: Rect): boolean {
  const pad = 0.75;
  return (
    inner.x >= outer.x - pad &&
    inner.y >= outer.y - pad &&
    inner.x + inner.w <= outer.x + outer.w + pad &&
    inner.y + inner.h <= outer.y + outer.h + pad
  );
}

/** Removes every annotation from a page's /Annots (used by redaction cleanup). */
export function removePageAnnotations(doc: PDFDocument, page: PDFPage): number {
  const annotsRef = page.node.Annots();
  if (!annotsRef) return 0;
  const annots = doc.context.lookup(annotsRef);
  const count = annots instanceof pdfLib.PDFArray ? annots.size() : 0;
  page.node.delete(pdfLib.PDFName.of('Annots'));
  return count;
}
