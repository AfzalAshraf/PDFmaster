/**
 * Renders PDFmaster objects into real PDF content on a pdf-lib page.
 * The same geometry helpers that drive the on-screen canvas are used here, so
 * what you see in the editor is what lands in the exported file.
 */
import {
  BlendMode,
  LineCapStyle,
  PDFDocument,
  PDFPage,
  degrees,
  fontForStyle,
  hexToRgb,
  pdfLib,
  sanitizeForStandardFont,
  wrapText,
} from './pdflib';
import type {
  AnyObject,
  Asset,
  FormFieldObject,
  HighlightObject,
  ImageObject,
  InkObject,
  LinkObject,
  MeasureObject,
  NoteObject,
  RedactObject,
  ShapeObject,
  SignatureObject,
  StampObject,
  TextBoxObject,
  WhiteoutObject,
} from './types';
import { dataUrlToUint8 } from './utils';
import { boundsOfObject, simplifyStroke } from './geometry';

export interface DrawContext {
  doc: PDFDocument;
  page: PDFPage;
  assets: Record<string, Asset>;
  /** Keep comments as real annotations (Acrobat comment pane). */
  keepComments: boolean;
  /** Force embedded TrueType fonts (required for PDF/A output). */
  embedFonts?: boolean;
  registerLink?: (rect: { x: number; y: number; w: number; h: number }, link: LinkObject) => void;
  registerNote?: (note: NoteObject) => void;
  registerMarkup?: (obj: HighlightObject) => void;
  registerWidget?: (field: FormFieldObject) => void;
}

/**
 * Normalized local point -> PDF user space.
 * Local coordinates are y-up inside the unrotated box (0 = bottom, 1 = top),
 * matching the on-screen SVG which flips them for CSS. Object rotation is
 * applied by the caller via the page CTM, not here — doing both flips ink
 * vertically and rotates lines twice.
 */
export function localPdfPoint(
  obj: { x: number; y: number; w: number; h: number },
  nx: number,
  ny: number,
): { x: number; y: number } {
  return { x: obj.x + nx * obj.w, y: obj.y + ny * obj.h };
}

const localPoint = localPdfPoint;

/** Rotation of `deg` degrees CCW about (cx, cy), as a PDF cm matrix. */
function rotationAbout(deg: number, cx: number, cy: number): [number, number, number, number, number, number] {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}

const CONTENT_ROTATED = new Set<AnyObject['kind']>([
  'textbox',
  'shape',
  'ink',
  'stamp',
  'signature',
  'image',
  'redact',
  'whiteout',
  'measure',
  'note',
]);

const HEX_BLACK = '#000000';

/* ------------------------------------------------------------------ */
/* per-kind renderers                                                 */
/* ------------------------------------------------------------------ */

function drawTextMarkup(_ctx: DrawContext, obj: HighlightObject) {
  const { page } = _ctx;
  const color = hexToRgb(obj.color);
  for (const q of obj.quads) {
    const pad = 0.7;
    switch (obj.kind) {
      case 'highlight':
        page.drawRectangle({
          x: q.x - pad,
          y: q.y - pad,
          width: q.w + pad * 2,
          height: q.h + pad * 2,
          color,
          opacity: obj.opacity,
          blendMode: BlendMode.Multiply,
        });
        break;
      case 'underline':
        page.drawLine({
          start: { x: q.x, y: q.y + 0.8 },
          end: { x: q.x + q.w, y: q.y + 0.8 },
          thickness: Math.max(0.8, q.h * 0.055),
          color,
          opacity: obj.opacity,
        });
        break;
      case 'strike':
        page.drawLine({
          start: { x: q.x, y: q.y + q.h * 0.42 },
          end: { x: q.x + q.w, y: q.y + q.h * 0.42 },
          thickness: Math.max(0.8, q.h * 0.06),
          color,
          opacity: obj.opacity,
        });
        break;
      case 'squiggly': {
        const step = Math.max(2, q.h * 0.22);
        const amp = Math.max(0.7, q.h * 0.055);
        const y = q.y + amp + 0.5;
        const pts: string[] = [`M ${q.x} ${y}`];
        let up = true;
        for (let x = q.x; x < q.x + q.w; x += step) {
          const nx = Math.min(x + step, q.x + q.w);
          pts.push(`Q ${(x + nx) / 2} ${up ? y + amp * 2 : y - amp * 2} ${nx} ${y}`);
          up = !up;
        }
        page.drawSvgPath(pts.join(' '), {
          x: 0,
          y: 0,
          borderColor: color,
          borderWidth: Math.max(0.7, q.h * 0.045),
          opacity: 0,
          borderOpacity: obj.opacity,
        });
        break;
      }
    }
  }
}

function drawNoteIcon(ctx: DrawContext, obj: NoteObject) {
  const { page } = ctx;
  const size = Math.max(12, Math.min(obj.w || 18, obj.h || 18));
  const color = hexToRgb(obj.color);
  page.drawRectangle({
    x: obj.x,
    y: obj.y,
    width: size,
    height: size,
    rx: size * 0.16,
    ry: size * 0.16,
    color,
    opacity: 0.97,
    borderColor: hexToRgb('#000000'),
    borderWidth: 0.4,
    borderOpacity: 0.15,
  });
  page.drawSvgPath(
    `M ${obj.x + size * 0.55} ${obj.y} L ${obj.x + size * 0.98} ${obj.y} L ${obj.x + size * 0.98} ${obj.y + size * 0.43} Z`,
    { x: 0, y: 0, color: hexToRgb('#000000'), opacity: 0.12 },
  );
  const font = fontForStyle(ctx.doc, { fontFamily: 'Helvetica', bold: true }, '!', { embed: ctx.embedFonts });
  const glyph = sanitizeForStandardFont('!', font);
  const fontSize = size * 0.6;
  const tw = font.widthOfTextAtSize(glyph, fontSize);
  page.drawText(glyph, {
    x: obj.x + (size - tw) / 2,
    y: obj.y + size * 0.24,
    size: fontSize,
    font,
    color: hexToRgb('#ffffff'),
  });
}

function drawTextBox(ctx: DrawContext, obj: TextBoxObject) {
  const { doc, page } = ctx;
  const style = obj.style;
  const font = fontForStyle(doc, style, obj.text, { embed: ctx.embedFonts });
  const fontSize = style.fontSize || 12;
  const lineHeight = (style.lineHeight ?? 1.25) * fontSize;
  const text = sanitizeForStandardFont(obj.text, font);
  const pad = 2;

  if (style.fill) {
    page.drawRectangle({
      x: obj.x,
      y: obj.y,
      width: obj.w,
      height: obj.h,
      color: hexToRgb(style.fill),
      opacity: obj.opacity,
    });
  }
  if (style.border) {
    page.drawRectangle({
      x: obj.x,
      y: obj.y,
      width: obj.w,
      height: obj.h,
      borderColor: hexToRgb(style.border),
      borderWidth: style.borderWidth ?? 0.75,
      opacity: 0,
      borderOpacity: obj.opacity,
    });
  }

  const lines = wrapText(text, font, fontSize, Math.max(4, obj.w - pad * 2));
  let cursorY = obj.y + obj.h - fontSize - (lineHeight - fontSize) * 0.5;
  for (const line of lines) {
    const width = font.widthOfTextAtSize(line, fontSize);
    let x = obj.x + pad;
    if (style.align === 'center') x = obj.x + (obj.w - width) / 2;
    else if (style.align === 'right') x = obj.x + obj.w - width - pad;
    if (cursorY < obj.y - lineHeight) break;
    page.drawText(line, {
      x,
      y: cursorY,
      size: fontSize,
      font,
      color: hexToRgb(style.color || HEX_BLACK),
      opacity: obj.opacity,
    });
    cursorY -= lineHeight;
  }
}

function drawShape(ctx: DrawContext, obj: ShapeObject) {
  const { page } = ctx;
  const stroke = hexToRgb(obj.stroke);
  const fill = obj.fill ? hexToRgb(obj.fill) : undefined;
  const dash = obj.dashed ? [Math.max(2, obj.strokeWidth * 2), Math.max(1.5, obj.strokeWidth * 1.6)] : undefined;
  switch (obj.shape) {
    case 'rect':
      page.drawRectangle({
        x: obj.x,
        y: obj.y,
        width: obj.w,
        height: obj.h,
        borderColor: stroke,
        borderWidth: obj.strokeWidth,
        color: fill,
        opacity: fill ? obj.opacity : 0,
        borderOpacity: obj.opacity,
        borderDashArray: dash,
      });
      break;
    case 'ellipse':
      page.drawEllipse({
        x: obj.x + obj.w / 2,
        y: obj.y + obj.h / 2,
        xScale: obj.w / 2,
        yScale: obj.h / 2,
        borderColor: stroke,
        borderWidth: obj.strokeWidth,
        color: fill,
        opacity: fill ? obj.opacity : 0,
        borderOpacity: obj.opacity,
        borderDashArray: dash,
      });
      break;
    case 'line':
    case 'arrow': {
      const a = localPoint(obj, obj.from?.x ?? 0, obj.from?.y ?? 0.5);
      const b = localPoint(obj, obj.to?.x ?? 1, obj.to?.y ?? 0.5);
      page.drawLine({
        start: a,
        end: b,
        thickness: obj.strokeWidth,
        color: stroke,
        opacity: obj.opacity,
        dashArray: dash,
        lineCap: LineCapStyle.Round,
      });
      if (obj.shape === 'arrow') drawArrowHead(page, a, b, obj.strokeWidth, stroke, obj.opacity);
      break;
    }
    case 'polygon': {
      const pts = (obj.points ?? []).map((p) => localPoint(obj, p.x, p.y));
      if (pts.length > 2) {
        const path = `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} Z`;
        page.drawSvgPath(path, {
          x: 0,
          y: 0,
          color: fill,
          opacity: fill ? obj.opacity : 0,
          borderColor: stroke,
          borderWidth: obj.strokeWidth,
          borderOpacity: obj.opacity,
        });
      } else if (pts.length === 2) {
        page.drawLine({ start: pts[0], end: pts[1], thickness: obj.strokeWidth, color: stroke, opacity: obj.opacity });
      }
      break;
    }
    case 'cloud':
      drawCloud(page, obj, stroke, obj.opacity);
      break;
  }
}

function drawArrowHead(
  page: PDFPage,
  a: { x: number; y: number },
  b: { x: number; y: number },
  width: number,
  color: ReturnType<typeof hexToRgb>,
  opacity: number,
) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return;
  const size = Math.max(6, width * 4.2);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const spread = 0.42;
  const p1 = { x: b.x - size * Math.cos(angle - spread), y: b.y - size * Math.sin(angle - spread) };
  const p2 = { x: b.x - size * Math.cos(angle + spread), y: b.y - size * Math.sin(angle + spread) };
  page.drawSvgPath(`M ${p1.x} ${p1.y} L ${b.x} ${b.y} L ${p2.x} ${p2.y} Z`, { x: 0, y: 0, color, opacity });
}

function drawCloud(page: PDFPage, obj: ShapeObject, color: ReturnType<typeof hexToRgb>, opacity: number) {
  const lobes = 14;
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;
  const rx = obj.w / 2;
  const ry = obj.h / 2;
  const r = Math.min(obj.w, obj.h) / 2;
  const path: string[] = [];
  for (let i = 0; i <= lobes; i++) {
    const angle = (i / lobes) * Math.PI * 2;
    const px = cx + rx * Math.cos(angle);
    const py = cy + ry * Math.sin(angle);
    const bulge = i % 2 === 0 ? r * 0.18 : 0;
    path.push(
      `${i === 0 ? 'M' : 'L'} ${px + Math.cos(angle) * bulge} ${py + Math.sin(angle) * bulge}`,
    );
  }
  path.push('Z');
  page.drawSvgPath(path.join(' '), {
    x: 0,
    y: 0,
    borderColor: color,
    borderWidth: obj.strokeWidth,
    opacity: 0,
    borderOpacity: opacity,
  });
}

function drawInk(ctx: DrawContext, obj: InkObject) {
  const { page } = ctx;
  const color = hexToRgb(obj.color);
  for (const raw of obj.strokes) {
    const pts = raw.map((p) => localPoint(obj, p.x, p.y));
    const simplified = pts.length > 12 ? simplifyStroke(pts, 0.6) : pts;
    if (simplified.length < 2) {
      if (simplified[0]) {
        page.drawCircle({
          x: simplified[0].x,
          y: simplified[0].y,
          size: obj.strokeWidth / 2,
          color,
          opacity: obj.highlighter ? 0.45 : obj.opacity,
        });
      }
      continue;
    }
    for (let i = 1; i < simplified.length; i++) {
      page.drawLine({
        start: simplified[i - 1],
        end: simplified[i],
        thickness: obj.strokeWidth,
        color,
        opacity: obj.highlighter ? 0.45 : obj.opacity,
        lineCap: LineCapStyle.Round,
        blendMode: obj.highlighter ? BlendMode.Multiply : undefined,
      });
    }
  }
}

function drawStamp(ctx: DrawContext, obj: StampObject) {
  const { doc, page } = ctx;
  const color = hexToRgb(obj.color);
  const label = obj.label;
  const fontSize = Math.min(obj.h * 0.48, (obj.w / Math.max(4, label.length)) * 1.75);
  const font = fontForStyle(doc, { fontFamily: 'Helvetica', bold: true }, label, { embed: ctx.embedFonts });
  const text = sanitizeForStandardFont(label, font);
  page.drawRectangle({
    x: obj.x,
    y: obj.y,
    width: obj.w,
    height: obj.h,
    rx: Math.min(obj.h * 0.2, 6),
    ry: Math.min(obj.h * 0.2, 6),
    borderColor: color,
    borderWidth: Math.max(1, obj.h * 0.05),
    borderOpacity: obj.opacity * 0.92,
    opacity: 0,
  });
  const tw = font.widthOfTextAtSize(text, fontSize);
  page.drawText(text, {
    x: obj.x + (obj.w - tw) / 2,
    y: obj.y + obj.h / 2 - fontSize * 0.36,
    size: fontSize,
    font,
    color,
    opacity: obj.opacity,
  });
  if (obj.detail) {
    const small = Math.max(5, fontSize * 0.6);
    const detail = sanitizeForStandardFont(obj.detail, font);
    const dw = font.widthOfTextAtSize(detail, small);
    page.drawText(detail, {
      x: obj.x + (obj.w - dw) / 2,
      y: obj.y + Math.max(1.5, obj.h * 0.1),
      size: small,
      font,
      color,
      opacity: obj.opacity * 0.92,
    });
  }
}

async function drawSignature(ctx: DrawContext, obj: SignatureObject) {
  const { page, doc } = ctx;
  const asset = obj.assetId ? ctx.assets[obj.assetId] : undefined;
  if (asset) {
    const bytes = dataUrlToUint8(asset.dataUrl);
    const image = await (asset.mime.includes('jpeg') ? doc.embedJpg(bytes) : doc.embedPng(bytes));
    page.drawImage(image, { x: obj.x, y: obj.y, width: obj.w, height: obj.h, opacity: obj.opacity });
  } else if (obj.text) {
    drawTextBox(ctx, {
      id: obj.id,
      pageId: obj.pageId,
      kind: 'textbox',
      x: obj.x,
      y: obj.y,
      w: obj.w,
      h: obj.h,
      rotation: obj.rotation,
      opacity: obj.opacity,
      text: obj.text,
      style: obj.style ?? {
        fontFamily: 'Helvetica',
        fontSize: Math.min(obj.h * 0.62, 26),
        color: '#14213d',
      },
    });
  }
  if (obj.rule) {
    page.drawLine({
      start: { x: obj.x, y: obj.y - 2 },
      end: { x: obj.x + obj.w, y: obj.y - 2 },
      thickness: 0.75,
      color: hexToRgb('#333333'),
      opacity: 0.85,
    });
  }
  if (obj.signer) {
    const font = fontForStyle(doc, { fontFamily: 'Helvetica' }, obj.signer, { embed: ctx.embedFonts });
    page.drawText(sanitizeForStandardFont(obj.signer, font), {
      x: obj.x,
      y: obj.y - 12,
      size: 8,
      font,
      color: hexToRgb('#444444'),
    });
  }
}

async function drawImage(ctx: DrawContext, obj: ImageObject) {
  const asset = ctx.assets[obj.assetId];
  if (!asset) return;
  const bytes = dataUrlToUint8(asset.dataUrl);
  const image = await (asset.mime.includes('jpeg') ? ctx.doc.embedJpg(bytes) : ctx.doc.embedPng(bytes));
  ctx.page.drawImage(image, { x: obj.x, y: obj.y, width: obj.w, height: obj.h, opacity: obj.opacity });
}

function drawRedaction(ctx: DrawContext, obj: RedactObject) {
  ctx.page.drawRectangle({
    x: obj.x,
    y: obj.y,
    width: obj.w,
    height: obj.h,
    color: hexToRgb(obj.color || HEX_BLACK),
    opacity: 1,
  });
  if (obj.label) {
    const font = fontForStyle(ctx.doc, { fontFamily: 'Helvetica', bold: true }, obj.label, { embed: ctx.embedFonts });
    const size = Math.min(obj.h * 0.55, (obj.w / Math.max(3, obj.label.length)) * 1.6);
    const text = sanitizeForStandardFont(obj.label, font);
    const tw = font.widthOfTextAtSize(text, size);
    ctx.page.drawText(text, {
      x: obj.x + (obj.w - tw) / 2,
      y: obj.y + obj.h / 2 - size * 0.35,
      size,
      font,
      color: hexToRgb('#ffffff'),
    });
  }
}

function drawWhiteout(ctx: DrawContext, obj: WhiteoutObject) {
  ctx.page.drawRectangle({
    x: obj.x,
    y: obj.y,
    width: obj.w,
    height: obj.h,
    color: hexToRgb(obj.color || '#ffffff'),
    opacity: obj.opacity,
  });
}

function drawMeasure(ctx: DrawContext, obj: MeasureObject) {
  const { page, doc } = ctx;
  const a = localPoint(obj, obj.from?.x ?? 0, obj.from?.y ?? 1);
  const b = localPoint(obj, obj.to?.x ?? 1, obj.to?.y ?? 0);
  const color = hexToRgb(obj.stroke);
  page.drawLine({ start: a, end: b, thickness: obj.strokeWidth, color, opacity: obj.opacity });
  drawArrowHead(page, a, b, obj.strokeWidth, color, obj.opacity);
  drawArrowHead(page, b, a, obj.strokeWidth, color, obj.opacity);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const value = (length / obj.pixelsPerUnit) * obj.scale;
  const label = `${value.toFixed(2)} ${obj.unitLabel}`;
  const font = fontForStyle(doc, { fontFamily: 'Helvetica', bold: true }, label, { embed: ctx.embedFonts });
  const size = 9;
  const text = sanitizeForStandardFont(label, font);
  const tw = font.widthOfTextAtSize(text, size);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  page.drawRectangle({
    x: mx - tw / 2 - 4,
    y: my + 3,
    width: tw + 8,
    height: size + 5,
    rx: 2,
    ry: 2,
    color: hexToRgb('#ffffff'),
    opacity: 0.95,
    borderColor: hexToRgb('#d92c1f'),
    borderWidth: 0.6,
    borderOpacity: 0.9,
  });
  page.drawText(text, { x: mx - tw / 2, y: my + 6, size, font, color: hexToRgb('#d92c1f') });
}

function drawLink(ctx: DrawContext, obj: LinkObject) {
  const rect = obj.rotation ? boundsOfObject(obj) : { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
  if (obj.hint || obj.linkType === 'page') {
    ctx.page.drawRectangle({
      x: obj.x,
      y: obj.y,
      width: obj.w,
      height: obj.h,
      borderColor: hexToRgb('#2f89ff'),
      borderWidth: 0.75,
      borderOpacity: 0.45,
      opacity: 0,
    });
  }
  ctx.registerLink?.(rect, obj);
}

/* ------------------------------------------------------------------ */
/* public API                                                         */
/* ------------------------------------------------------------------ */

export async function drawObject(ctx: DrawContext, obj: AnyObject): Promise<void> {
  const rotate = Boolean(obj.rotation) && CONTENT_ROTATED.has(obj.kind);
  if (rotate) {
    const [a, b, c, d, e, f] = rotationAbout(obj.rotation, obj.x + obj.w / 2, obj.y + obj.h / 2);
    ctx.page.pushOperators(
      pdfLib.pushGraphicsState(),
      pdfLib.concatTransformationMatrix(a, b, c, d, e, f),
    );
  }
  try {
    await drawObjectUnrotated(ctx, obj);
  } finally {
    if (rotate) ctx.page.pushOperators(pdfLib.popGraphicsState());
  }
}

async function drawObjectUnrotated(ctx: DrawContext, obj: AnyObject): Promise<void> {
  switch (obj.kind) {
    case 'highlight':
    case 'underline':
    case 'strike':
    case 'squiggly':
      drawTextMarkup(ctx, obj);
      if (ctx.keepComments && ctx.registerMarkup) ctx.registerMarkup(obj);
      break;
    case 'note':
      drawNoteIcon(ctx, obj);
      if (ctx.keepComments && ctx.registerNote) ctx.registerNote(obj);
      break;
    case 'textbox':
      drawTextBox(ctx, obj);
      break;
    case 'shape':
      drawShape(ctx, obj);
      break;
    case 'ink':
      drawInk(ctx, obj);
      break;
    case 'stamp':
      drawStamp(ctx, obj);
      break;
    case 'signature':
      await drawSignature(ctx, obj);
      break;
    case 'image':
      await drawImage(ctx, obj);
      break;
    case 'redact':
      drawRedaction(ctx, obj);
      break;
    case 'whiteout':
      drawWhiteout(ctx, obj);
      break;
    case 'measure':
      drawMeasure(ctx, obj);
      break;
    case 'link':
      drawLink(ctx, obj);
      break;
    case 'formfield':
      ctx.registerWidget?.(obj);
      break;
  }
}

/** Draws a rotation-aware watermark (single centred or tiled). */
export function drawWatermark(
  doc: PDFDocument,
  page: PDFPage,
  opts: {
    text: string;
    fontSize: number;
    color: string;
    opacity: number;
    rotation: number;
    tile?: boolean;
    fontFamily?: string;
    bold?: boolean;
    italic?: boolean;
    embedFonts?: boolean;
  },
): void {
  const font = fontForStyle(
    doc,
    { fontFamily: opts.fontFamily ?? 'Helvetica', bold: opts.bold, italic: opts.italic },
    opts.text,
    { embed: opts.embedFonts },
  );
  const text = sanitizeForStandardFont(opts.text, font);
  const color = hexToRgb(opts.color);
  const { width, height } = page.getSize();
  if (opts.tile) {
    const stepX = Math.max(140, font.widthOfTextAtSize(text, opts.fontSize) + 70);
    const stepY = opts.fontSize * 3.6;
    for (let y = -height * 0.15; y < height * 1.15; y += stepY) {
      for (let x = -width * 0.15; x < width * 1.15; x += stepX) {
        page.drawText(text, {
          x,
          y,
          size: opts.fontSize,
          font,
          color,
          opacity: opts.opacity,
          rotate: degrees(opts.rotation),
        });
      }
    }
    return;
  }
  const tw = font.widthOfTextAtSize(text, opts.fontSize);
  const rad = (opts.rotation * Math.PI) / 180;
  page.drawText(text, {
    x: width / 2 - (tw / 2) * Math.cos(rad) + (opts.fontSize / 2) * Math.sin(rad),
    y: height / 2 - (tw / 2) * Math.sin(rad) - (opts.fontSize / 2) * Math.cos(rad),
    size: opts.fontSize,
    font,
    color,
    opacity: opts.opacity,
    rotate: degrees(opts.rotation),
  });
}

export function drawTextBlock(
  doc: PDFDocument,
  page: PDFPage,
  opts: {
    text: string;
    x: number;
    y: number;
    fontSize: number;
    color: string;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    italic?: boolean;
    fontFamily?: string;
    opacity?: number;
    embedFonts?: boolean;
    /** Counter-rotation (degrees, CCW in PDF space) for rotated pages. */
    rotateDeg?: number;
  },
): void {
  const font = fontForStyle(
    doc,
    { fontFamily: opts.fontFamily ?? 'Helvetica', bold: opts.bold, italic: opts.italic },
    opts.text,
    { embed: opts.embedFonts },
  );
  const size = opts.fontSize;
  const text = sanitizeForStandardFont(opts.text, font);
  const tw = font.widthOfTextAtSize(text, size);
  const rad = ((opts.rotateDeg ?? 0) * Math.PI) / 180;
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };
  let x = opts.x;
  let y = opts.y;
  if (opts.align === 'center') {
    x -= (tw / 2) * dir.x;
    y -= (tw / 2) * dir.y;
  } else if (opts.align === 'right') {
    x -= tw * dir.x;
    y -= tw * dir.y;
  }
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: hexToRgb(opts.color),
    opacity: opts.opacity ?? 1,
    ...(opts.rotateDeg ? { rotate: degrees(opts.rotateDeg) } : {}),
  });
}
