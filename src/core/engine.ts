/**
 * Document build pipeline: turns the editing session (page list + objects +
 * content edits + security settings) into a real PDF byte stream.
 *
 * The working document is deliberately kept as *references* to source pages
 * ("PageEntry") so that reordering, rotating or deleting pages is instant; this
 * module is where that model is materialised into an actual file.
 */
import { PDFDocument, PDFPage, degrees, hexToRgb, pdfLib, registerFontkit } from './pdflib';
import { drawObject, drawTextBlock, drawWatermark, type DrawContext } from './draw';
import { addLinkAnnotation, addMarkupAnnotation, addNoteAnnotation, createFormField } from './annotations';
import { applyPageEdits, type PaintedText } from './textedit';
import { coverRectForWord, planOcrReplacements } from './ocr';
import { sanitizeForStandardFont, fontForStyle } from './pdflib';
import type {
  AnyObject,
  Asset,
  Attachment,
  BatesSettings,
  Bookmark,
  DocumentMeta,
  HeaderFooterSettings,
  OcrPageResult,
  OcrWord,
  PageEntry,
  PageId,
  Rect,
  SecuritySettings,
  SourceDoc,
  TextEditOp,
  WatermarkSettings,
} from './types';
import { boundsOfObject } from './geometry';
import { sanitizeFilename, truncate } from './utils';
import { hasPdfHeader, normalizePdfBytes } from './pdfbytes';
import { getDocumentProxy, recoverSourceBytes } from './registry';

const { PDFName, PDFNumber, PDFString } = pdfLib;

export interface BuildOptions {
  /** Keep comment objects as real PDF annotations (Acrobat comment pane). */
  keepComments?: boolean;
  /** Flatten interactive form fields into the page content. */
  flattenForms?: boolean;
  /** Remove annotations that came with the source documents. */
  removeExistingAnnotations?: boolean;
  /** Produce PDF/A-2b metadata + embedded fonts. */
  pdfA?: boolean;
  /** Compress with object streams (default true). */
  compress?: boolean;
  /** Embed TrueType fonts for all drawn text. */
  embedFonts?: boolean;
  /** Write the invisible OCR text layer (default true when OCR data exists). */
  ocr?: boolean;
  documentJS?: string;
  language?: string;
  author?: string;
}

export interface BuildInput {
  pages: PageEntry[];
  objectsByPage: Record<PageId, AnyObject[]>;
  assets: Record<string, Asset>;
  sources: Record<string, SourceDoc>;
  crops: Record<PageId, Rect>;
  textEdits: TextEditOp[];
  ocr: Record<PageId, OcrPageResult>;
  meta: DocumentMeta;
  security: SecuritySettings;
  watermark: WatermarkSettings;
  headerFooter: HeaderFooterSettings;
  pageNumbers: {
    enabled: boolean;
    position: string;
    startAt: number;
    fontSize: number;
    color: string;
    margin: number;
    prefix: string;
    suffix: string;
  };
  bates: BatesSettings;
  bookmarks: Bookmark[];
  attachments: Attachment[];
  options?: BuildOptions;
}

export interface BuildStats {
  pages: number;
  objects: number;
  editsApplied: number;
  editsFailed: number;
  redactions: number;
  /** OCR words covered and redrawn with their replacements. */
  ocrReplaced: number;
  /** Human-readable reasons for failed edits / replacements ("Page 2: …"). */
  editErrors: string[];
}

export interface BuildResult {
  bytes: Uint8Array;
  warnings: string[];
  stats: BuildStats;
}

export class BuildError extends Error {
  readonly details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = 'BuildError';
    this.details = details;
  }
}

export type ProgressFn = (pct: number, label: string) => void;

/** Builds the full PDF for the given input and returns its bytes. */
export async function buildPdf(input: BuildInput, onProgress: ProgressFn = () => {}): Promise<BuildResult> {
  const warnings: string[] = [];
  const stats: BuildStats = { pages: 0, objects: 0, editsApplied: 0, editsFailed: 0, redactions: 0, ocrReplaced: 0, editErrors: [] };
  const opts: Required<Pick<BuildOptions, 'keepComments' | 'flattenForms' | 'removeExistingAnnotations' | 'pdfA' | 'compress' | 'embedFonts'>> & BuildOptions = {
    keepComments: false,
    flattenForms: false,
    removeExistingAnnotations: false,
    pdfA: false,
    compress: true,
    embedFonts: false,
    ...input.options,
  };

  const activePages = input.pages.filter((p) => !p.deleted);
  if (!activePages.length) throw new BuildError('There are no pages to export.');

  onProgress(2, 'Preparing');
  const out = await PDFDocument.create({ updateMetadata: false });
  registerFontkit(out);

  /* ------------------------- load source documents ------------------------ */
  const sourceCache = new Map<string, PDFDocument>();
  const neededSources = [...new Set(activePages.map((p) => p.sourceId))];
  const missing: string[] = [];
  for (const [i, sourceId] of neededSources.entries()) {
    const source = input.sources[sourceId];
    if (!source) {
      missing.push(`Unknown source for page (${sourceId})`);
      continue;
    }
    onProgress(2 + (i / neededSources.length) * 10, `Loading ${source.name}`);
    try {
      const loaded = await loadSourceDocument(source);
      sourceCache.set(sourceId, loaded.doc);
      if (loaded.warning) warnings.push(loaded.warning);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/encrypted|password/i.test(message)) {
        missing.push(`${source.name} is password protected — unlock it in the Organize panel first.`);
      } else if (/no pdf data|reopen the file/i.test(message)) {
        missing.push(message);
      } else {
        missing.push(`${source.name} could not be parsed (${message}).`);
      }
    }
  }
  if (missing.length) throw new BuildError('Some documents could not be included in the export.', missing);

  /* ----------------------------- copy pages ------------------------------- */
  const copied: PDFPage[] = [];
  for (const [i, entry] of activePages.entries()) {
    const src = sourceCache.get(entry.sourceId);
    if (!src) continue;
    const [page] = await out.copyPages(src, [entry.sourceIndex]);
    const added = out.addPage(page);
    // Pages opened before this fix, and not yet painted, have no stored
    // baseRotation. Replacing /Rotate with 0 would flatten a sideways scan.
    const measured = entry.mediaWidth > 0 || entry.mediaHeight > 0;
    const sourceAngle = measured ? entry.baseRotation : ((added.getRotation().angle % 360) + 360) % 360;
    const rotation = (((sourceAngle + entry.rotation) % 360) + 360) % 360;
    added.setRotation(degrees(rotation));
    copied.push(added);
    if (i % 5 === 0) onProgress(12 + (i / activePages.length) * 18, `Copying pages (${i + 1}/${activePages.length})`);
  }
  stats.pages = copied.length;

  /* --------------------------- per-page content --------------------------- */
  for (const [i, page] of copied.entries()) {
    const entry = activePages[i];
    const pageObjects = input.objectsByPage[entry.id] ?? [];
    onProgress(30 + (i / copied.length) * 45, `Rendering page ${i + 1}/${copied.length}`);

    // 1) Crop box
    const crop = input.crops[entry.id];
    if (crop && crop.w > 1 && crop.h > 1) {
      page.setCropBox(crop.x, crop.y, crop.w, crop.h);
    }

    // 2) Content edits + true redaction (must happen before we draw anything:
    //    it rewrites the page's content streams).
    const edits = input.textEdits.filter((e) => e.pageId === entry.id);
    const redactRects = pageObjects
      .filter((o): o is Extract<AnyObject, { kind: 'redact' }> => o.kind === 'redact')
      .map((o) => boundsOfObject(o));
    const painted: PaintedText[] = [];
    if (edits.length || redactRects.length) {
      const res = applyPageEdits(out, page, edits, redactRects);
      stats.editsApplied += res.edit.applied;
      stats.editsFailed += res.edit.failed;
      stats.redactions += res.redact.removedTextRuns + res.redact.removedXObjects;
      painted.push(...res.paint);
      for (const failed of res.edit.failedEdits) {
        stats.editErrors.push(`Page ${i + 1}: "${truncate(failed.original)}" was not found in the page content.`);
      }
    }

    // 3) Objects (annotations / edits / forms / links)
    const drawCtx: DrawContext = {
      doc: out,
      page,
      assets: input.assets,
      keepComments: opts.keepComments,
      embedFonts: opts.embedFonts || opts.pdfA,
      registerLink: (rect, link) => {
        if (link.linkType === 'page') {
          const byId = link.targetPageId ? activePages.findIndex((entry) => entry.id === link.targetPageId) : -1;
          const targetIndex = Math.min(Math.max(byId >= 0 ? byId : (link.targetPage ?? 0), 0), copied.length - 1);
          const target = copied[targetIndex];
          if (target) addLinkAnnotation(out, page, rect, '', target.ref);
          return;
        }
        addLinkAnnotation(out, page, rect, link.url);
      },
      registerNote: (note) => addNoteAnnotation(out, page, note, opts.author || input.meta.author || 'PDFmaster'),
      registerMarkup: (obj) => addMarkupAnnotation(out, page, obj, opts.author || input.meta.author || 'PDFmaster'),
      registerWidget: (field) => createFormField(out, page, field),
    };
    for (const obj of sortForDrawing(pageObjects)) {
      await drawObject(drawCtx, obj);
      stats.objects += 1;
    }
    for (const text of painted) {
      drawTextReplacement(out, page, text, opts.embedFonts || opts.pdfA);
    }

    // 4) Page decorations: watermark, header/footer, numbering, Bates
    const visual = visualGeometry(page);
    const batesLabel = formatBates(input.bates, input.bates.startAt + i);
    if (input.watermark.enabled && input.watermark.text.trim() && watermarked(input.watermark, i)) {
      drawWatermark(out, page, {
        text: expandTemplate(input.watermark.text, i, activePages.length, input.meta, entry, batesLabel),
        fontSize: input.watermark.fontSize,
        color: input.watermark.color,
        opacity: input.watermark.opacity,
        // Page /Rotate is clockwise on screen; add it so the watermark keeps
        // the angle the user picked in the (already rotated) preview.
        rotation: input.watermark.rotation + decorationRotation(visual),
        tile: input.watermark.tile,
        bold: input.watermark.bold,
        italic: input.watermark.italic,
        fontFamily: input.watermark.fontFamily,
        embedFonts: opts.embedFonts || opts.pdfA,
      });
    }
    if (input.headerFooter.enabled && !(input.headerFooter.firstPageDifferent && i === 0)) {
      drawHeaderFooter(
        out,
        page,
        visual,
        input.headerFooter,
        input.meta,
        entry,
        i,
        activePages.length,
        opts.embedFonts || opts.pdfA,
        batesLabel,
      );
    }
    if (input.pageNumbers.enabled) {
      const label = `${expandTemplate(input.pageNumbers.prefix, i, activePages.length, input.meta, entry)}${i + input.pageNumbers.startAt}${expandTemplate(
        input.pageNumbers.suffix,
        i,
        activePages.length,
        input.meta,
        entry,
      )}`;
      drawAtPosition(out, page, visual, label, input.pageNumbers.position, input.pageNumbers.fontSize, input.pageNumbers.color, input.pageNumbers.margin, false, opts.embedFonts || opts.pdfA);
    }
    if (input.bates.enabled) {
      drawAtPosition(out, page, visual, batesLabel, input.bates.position, input.bates.fontSize, input.bates.color, input.bates.margin, true, opts.embedFonts || opts.pdfA);
    }

    // 5) OCR: word replacements drawn over the scan, then the invisible
    //    (but selectable / searchable) text layer — skipping replaced words
    //    so their replacement is not duplicated in the text layer.
    const ocr = input.ocr[entry.id];
    if (ocr?.words?.length) {
      const plan = planOcrReplacements(ocr.words, ocr.replacements ?? []);
      for (const [wordIndex, item] of plan.replace) {
        drawOcrReplacement(out, page, ocr.words[wordIndex], item, opts.embedFonts || opts.pdfA);
        stats.ocrReplaced += 1;
      }
      for (const replacement of plan.unmatched) {
        stats.editErrors.push(`Page ${i + 1}: OCR replacement "${truncate(replacement.original)}" matched no recognised word.`);
      }
      if (opts.ocr !== false) drawOcrLayer(out, page, ocr, [...plan.replace.keys()]);
    }

    // 6) Strip inherited annotations
    if (opts.removeExistingAnnotations) {
      page.node.delete(PDFName.of('Annots'));
    }
  }

  /* ------------------------------- metadata ------------------------------- */
  onProgress(78, 'Writing metadata');
  const meta = input.meta ?? ({} as DocumentMeta);
  if (meta.title) out.setTitle(meta.title);
  if (meta.author) out.setAuthor(meta.author);
  if (meta.subject) out.setSubject(meta.subject);
  if (meta.keywords) out.setKeywords(meta.keywords.split(/[,;]\s*/).filter(Boolean));
  out.setCreator(meta.creator || 'PDFmaster');
  out.setProducer(meta.producer || 'PDFmaster 1.0');
  if (opts.language) out.setLanguage(opts.language);

  /* ------------------------------- bookmarks ------------------------------ */
  if (input.bookmarks.length) {
    try {
      writeOutline(out, input.bookmarks, activePages);
    } catch {
      warnings.push('Bookmarks could not be written to the outline.');
    }
  }

  /* ------------------------------ attachments ----------------------------- */
  for (const attachment of input.attachments) {
    try {
      await out.attach(attachment.bytes, attachment.name, {
        mimeType: attachment.mime,
        description: attachment.description,
        creationDate: new Date(),
        modificationDate: new Date(),
      });
    } catch {
      warnings.push(`Attachment "${attachment.name}" could not be embedded.`);
    }
  }

  /* ------------------------------ document JS ----------------------------- */
  if (opts.documentJS?.trim()) {
    try {
      out.addJavaScript('PDFmasterDocJS', opts.documentJS);
    } catch {
      warnings.push('Document JavaScript could not be added.');
    }
  }

  /* --------------------------------- forms -------------------------------- */
  try {
    const form = out.getForm();
    const fields = form.getFields();
    if (fields.length) {
      if (opts.flattenForms) {
        form.flatten();
      } else {
        form.updateFieldAppearances();
      }
    }
  } catch {
    warnings.push('Form fields could not be finalised.');
  }

  /* -------------------------------- PDF/A --------------------------------- */
  if (opts.pdfA) {
    try {
      out.convertToPDFA({ conformance: '2B' });
    } catch (err) {
      warnings.push(`PDF/A conversion reported an issue: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /* ------------------------------- security ------------------------------- */
  if (input.security.enabled && (input.security.userPassword || input.security.ownerPassword)) {
    if (opts.pdfA) {
      warnings.push('PDF/A forbids encryption, so the exported file is not encrypted.');
    } else {
      try {
        out.encrypt({
          userPassword: input.security.userPassword || undefined,
          ownerPassword: input.security.ownerPassword || input.security.userPassword || undefined,
          algorithm: input.security.algorithm,
          allowWeakCryptography: true,
          permissions: {
            printing:
              input.security.allowPrinting === 'none'
                ? false
                : input.security.allowPrinting === 'lowResolution'
                  ? 'lowResolution'
                  : 'highResolution',
            copying: input.security.allowCopying,
            modifying: input.security.allowModifying,
            annotating: input.security.allowAnnotating,
            fillingForms: input.security.allowForms,
            contentAccessibility: input.security.allowAccessibility,
            documentAssembly: input.security.allowAssembly,
          },
        });
      } catch (err) {
        warnings.push(`Encryption failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  onProgress(88, 'Serialising');
  const bytes = await out.save({
    useObjectStreams: opts.compress,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
  onProgress(100, 'Done');
  return { bytes, warnings, stats };
}

async function loadSourceDocument(source: SourceDoc): Promise<{ doc: PDFDocument; warning?: string }> {
  let bytes = normalizePdfBytes(source.bytes);
  if (!hasPdfHeader(bytes)) {
    const recovered = await recoverSourceBytes(source);
    if (recovered) bytes = recovered;
  }
  if (hasPdfHeader(bytes)) {
    try {
      source.bytes = bytes;
      source.size = bytes.byteLength;
      return {
        doc: await PDFDocument.load(bytes, {
          password: source.password,
          ignoreEncryption: !source.password,
          throwOnInvalidObject: false,
          updateMetadata: false,
        }),
      };
    } catch (err) {
      const rebuilt = await rebuildFromViewer(source);
      if (rebuilt) {
        return {
          doc: rebuilt,
          warning: `${source.name} could not be parsed, so this export is a visual copy of the pages on screen. Your annotations and text edits are drawn on top.`,
        };
      }
      throw err;
    }
  }
  const rebuilt = await rebuildFromViewer(source);
  if (rebuilt) {
    return {
      doc: rebuilt,
      warning: `${source.name} had no usable PDF data in memory, so this export is a visual copy of the pages on screen.`,
    };
  }
  throw new Error(`${source.name} has no PDF data in memory. Reopen the file, then export again.`);
}

/** Last resort: paint each page the viewer can already show into a new PDF. */
async function rebuildFromViewer(source: SourceDoc): Promise<PDFDocument | null> {
  if (typeof document === 'undefined') return null;
  try {
    const proxy = await getDocumentProxy(source);
    const doc = await PDFDocument.create();
    for (let i = 0; i < proxy.numPages; i++) {
      const page = await proxy.getPage(i + 1);
      const viewport = page.getViewport({ scale: 2, rotation: 0 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' }).promise;
      const png = await canvasToPng(canvas);
      const image = await doc.embedPng(png);
      const added = doc.addPage([viewport.width / 2, viewport.height / 2]);
      added.drawImage(image, { x: 0, y: 0, width: added.getWidth(), height: added.getHeight() });
    }
    return doc.getPageCount() ? doc : null;
  } catch {
    return null;
  }
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((next) => resolve(next), 'image/png'));
  if (blob) {
    if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }
  const url = canvas.toDataURL('image/png');
  const binary = atob(url.split(',')[1] ?? '');
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

/** Draws locked/hidden ordering: lower z first, notes last so icons stay on top. */
function sortForDrawing(objects: AnyObject[]): AnyObject[] {
  const rank = (o: AnyObject) => (o.kind === 'note' ? 2 : o.kind === 'textbox' || o.kind === 'stamp' ? 1 : 0);
  return [...objects].sort((a, b) => rank(a) - rank(b) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

function watermarked(settings: WatermarkSettings, pageIndex: number): boolean {
  if (settings.pages === 'all') return true;
  return settings.pages.includes(pageIndex);
}

interface VisualGeometry {
  /** Displayed (visual) page size, y down. */
  width: number;
  height: number;
  /** Unrotated page size. */
  contentWidth: number;
  contentHeight: number;
  rotation: number;
}

export function visualGeometry(page: PDFPage): VisualGeometry {
  const { width, height } = page.getSize();
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  const swapped = angle === 90 || angle === 270;
  return {
    width: swapped ? height : width,
    height: swapped ? width : height,
    contentWidth: width,
    contentHeight: height,
    rotation: angle,
  };
}

/**
 * Visual (y-down, top-left origin, as displayed) -> unrotated PDF coordinates.
 * Verified against pdf.js viewport transforms for all four rotations.
 */
export function visualToContent(g: VisualGeometry, vx: number, vy: number): { x: number; y: number } {
  const { contentWidth: w, contentHeight: h, rotation } = g;
  switch (rotation) {
    case 90:
      return { x: vy, y: vx };
    case 180:
      return { x: w - vx, y: vy };
    case 270:
      return { x: w - vy, y: h - vx };
    default:
      return { x: vx, y: h - vy };
  }
}

/** Counter-rotation so decorations appear upright in the displayed page. */
export const decorationRotation = (g: VisualGeometry) => g.rotation;

function formatBates(settings: BatesSettings, value: number): string {
  return `${settings.prefix}${String(value).padStart(Math.max(1, settings.digits), '0')}${settings.suffix}`;
}

function expandTemplate(
  template: string,
  index: number,
  total: number,
  meta: DocumentMeta,
  entry: PageEntry,
  bates = '',
): string {
  if (!template) return '';
  return template
    .replace(/\{page\}/gi, String(index + 1))
    .replace(/\{pages\}/gi, String(total))
    .replace(/\{date\}/gi, new Date().toLocaleDateString())
    .replace(/\{time\}/gi, new Date().toLocaleTimeString())
    .replace(/\{title\}/gi, meta.title || '')
    .replace(/\{filename\}/gi, sanitizeFilename(meta.title || 'document'))
    .replace(/\{source\}/gi, entry.sourceId.slice(0, 6))
    .replace(/\{bates\}/gi, bates);
}

function drawHeaderFooter(
  doc: PDFDocument,
  page: PDFPage,
  g: VisualGeometry,
  settings: HeaderFooterSettings,
  meta: DocumentMeta,
  entry: PageEntry,
  index: number,
  total: number,
  embedFonts: boolean,
  bates = '',
): void {
  const size = settings.fontSize;
  const margin = settings.margin;
  const topY = g.height - margin - size;
  const bottomY = margin;
  const slots: Array<{ template: string; x: number; align: 'left' | 'center' | 'right' }> = [
    { template: settings.header.left, x: margin, align: 'left' },
    { template: settings.header.center, x: g.width / 2, align: 'center' },
    { template: settings.header.right, x: g.width - margin, align: 'right' },
    { template: settings.footer.left, x: margin, align: 'left' },
    { template: settings.footer.center, x: g.width / 2, align: 'center' },
    { template: settings.footer.right, x: g.width - margin, align: 'right' },
  ];
  const rotateDeg = decorationRotation(g);
  slots.forEach((slot, i) => {
    if (!slot.template?.trim()) return;
    const isFooter = i >= 3;
    const text = expandTemplate(slot.template, index, total, meta, entry, bates);
    const pos = visualToContent(g, slot.x, isFooter ? bottomY : topY);
    drawTextBlock(doc, page, {
      text,
      x: pos.x,
      y: pos.y,
      fontSize: size,
      color: settings.color,
      align: slot.align,
      fontFamily: settings.fontFamily,
      embedFonts,
      rotateDeg,
    });
  });
}

function drawAtPosition(
  doc: PDFDocument,
  page: PDFPage,
  g: VisualGeometry,
  text: string,
  position: string,
  fontSize: number,
  color: string,
  margin: number,
  bold: boolean,
  embedFonts: boolean,
): void {
  if (!text) return;
  const [vertical, horizontal] = position.split('-') as [string, string];
  const y =
    vertical === 'top' ? g.height - margin - fontSize : vertical === 'middle' ? g.height / 2 : margin;
  const x = horizontal === 'left' ? margin : horizontal === 'right' ? g.width - margin : g.width / 2;
  const pos = visualToContent(g, x, y);
  drawTextBlock(doc, page, {
    text,
    x: pos.x,
    y: pos.y,
    fontSize,
    color,
    align: horizontal === 'left' ? 'left' : horizontal === 'right' ? 'right' : 'center',
    bold,
    embedFonts,
    rotateDeg: decorationRotation(g),
  });
}

/**
 * Invisible (rendering mode 3) text layer produced by OCR: selectable,
 * searchable and copyable, exactly like Acrobat's "Recognize Text".
 * Words listed in `skip` were replaced with visible text and are left out so
 * selection does not yield each replacement twice.
 */
function drawOcrLayer(doc: PDFDocument, page: PDFPage, ocr: OcrPageResult, skip: Iterable<number> = []): void {
  const { TextRenderingMode, setTextRenderingMode, pushGraphicsState, popGraphicsState, setCharacterSqueeze } = pdfLib;
  const font = doc.embedStandardFont(pdfLib.StandardFonts.Helvetica);
  const skipped = new Set(skip);
  ocr.words.forEach((word, index) => {
    if (skipped.has(index) || !word.text.trim()) return;
    const size = Math.max(3, Math.min(72, word.rect.h * 0.82));
    let natural = 0;
    for (const ch of word.text) natural += font.widthOfTextAtSize(ch, size);
    const squeeze = natural > 0 ? Math.max(10, Math.min(400, (word.rect.w / natural) * 100)) : 100;
    page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible), setCharacterSqueeze(squeeze));
    try {
      page.drawText(word.text, {
        x: word.rect.x,
        y: word.rect.y + word.rect.h * 0.1,
        size,
        font,
        color: hexToRgb('#000000'),
      });
    } catch {
      /* skip words the standard font cannot encode */
    }
    page.pushOperators(setCharacterSqueeze(100), setTextRenderingMode(TextRenderingMode.Fill), popGraphicsState());
  });
}

/**
 * Draws an OCR word replacement over the scan: a covering box in the sampled
 * background colour, then the new word as visible, searchable text. The
 * rendering mode is explicitly forced to "fill" inside a fresh graphics state
 * so an inherited invisible state cannot hide the replacement.
 */
function drawOcrReplacement(
  doc: PDFDocument,
  page: PDFPage,
  word: OcrWord,
  item: { text: string; bg?: string },
  embedFonts: boolean,
): void {
  const { TextRenderingMode, setTextRenderingMode, pushGraphicsState, popGraphicsState, setCharacterSqueeze } = pdfLib;
  if (!item.text.trim()) return;
  const cover = coverRectForWord(word.rect);
  page.drawRectangle({ x: cover.x, y: cover.y, width: cover.w, height: cover.h, color: hexToRgb(item.bg ?? '#ffffff') });
  const font = fontForStyle(doc, { fontFamily: 'Helvetica' }, item.text, { embed: embedFonts });
  const text = sanitizeForStandardFont(item.text, font);
  const size = Math.max(3, Math.min(72, word.rect.h * 0.82));
  const natural = font.widthOfTextAtSize(text, size);
  // Shrink (never stretch) so the replacement fits the word it replaces.
  const squeeze = natural > word.rect.w ? Math.max(60, (word.rect.w / natural) * 100) : 100;
  page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Fill), setCharacterSqueeze(squeeze));
  try {
    page.drawText(text, {
      x: word.rect.x,
      y: word.rect.y + word.rect.h * 0.1,
      size,
      font,
      color: hexToRgb('#000000'),
    });
  } catch {
    /* unencodable replacement: the cover still hides the original word */
  }
  page.pushOperators(setCharacterSqueeze(100), setTextRenderingMode(TextRenderingMode.Fill), popGraphicsState());
}

/**
 * Re-paints a text run that could not be rewritten in place (a replacement
 * the original font cannot encode, or a run that was invisible — an OCR text
 * layer over a scan). When the original run was invisible, its raster word is
 * covered with a background-coloured box first; the replacement is then drawn
 * with the text rendering mode explicitly reset to "fill" inside a fresh
 * graphics state, so an inherited invisible state (`Tr 3`) cannot make it
 * disappear.
 */
function drawTextReplacement(doc: PDFDocument, page: PDFPage, painted: PaintedText, embedFonts: boolean): void {
  const { TextRenderingMode, setTextRenderingMode, pushGraphicsState, popGraphicsState } = pdfLib;
  const font = fontForStyle(
    doc,
    { fontFamily: painted.serif ? 'Times' : 'Helvetica', bold: painted.bold, italic: painted.italic },
    painted.text,
    { embed: embedFonts },
  );
  const text = sanitizeForStandardFont(painted.text, font);
  if (painted.cover && Math.abs(painted.rotation) < 1) {
    const c = painted.cover;
    page.drawRectangle({ x: c.x, y: c.y, width: c.w, height: c.h, color: hexToRgb(painted.coverColor ?? '#ffffff') });
  }
  let size = painted.size;
  if (painted.cover) {
    const natural = font.widthOfTextAtSize(text, size);
    const maxWidth = Math.max(8, painted.cover.w);
    if (natural > maxWidth * 1.35) size = Math.max(size * 0.4, (maxWidth / natural) * size);
  }
  page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Fill));
  try {
    page.drawText(text, {
      x: painted.x,
      y: painted.y,
      size,
      font,
      color: hexToRgb(painted.color),
      ...(painted.rotation ? { rotate: degrees(painted.rotation) } : {}),
    });
  } finally {
    page.pushOperators(setTextRenderingMode(TextRenderingMode.Fill), popGraphicsState());
  }
}

/** Writes a flat outline (/Outlines) so bookmarks show in every PDF reader. */
function writeOutline(doc: PDFDocument, bookmarks: Bookmark[], pages: PageEntry[]): void {
  const catalog = doc.catalog;
  const resolvedIndex = (bookmark: Bookmark) => {
    const byId = bookmark.pageId ? pages.findIndex((page) => page.id === bookmark.pageId) : -1;
    return byId >= 0 ? byId : bookmark.pageIndex;
  };
  const items = [...bookmarks].sort((a, b) => resolvedIndex(a) - resolvedIndex(b));
  if (!items.length || !pages.length) return;
  const outlinesRef = doc.context.register(doc.context.obj({ Type: 'Outlines' }));
  const itemRefs = items.map((bookmark) => {
    const pageIndex = Math.min(Math.max(resolvedIndex(bookmark), 0), doc.getPageCount() - 1);
    const target = doc.getPage(pageIndex);
    const dict = doc.context.obj({
      Title: PDFString.of(bookmark.title),
      Parent: outlinesRef,
      Dest: [target.ref, PDFName.of('Fit')],
    });
    return doc.context.register(dict);
  });
  itemRefs.forEach((ref, i) => {
    const dict = doc.context.lookup(ref);
    if (!(dict instanceof pdfLib.PDFDict)) return;
    if (i > 0) dict.set(PDFName.of('Prev'), itemRefs[i - 1]);
    if (i < itemRefs.length - 1) dict.set(PDFName.of('Next'), itemRefs[i + 1]);
  });
  const outlines = doc.context.lookup(outlinesRef);
  if (outlines instanceof pdfLib.PDFDict) {
    outlines.set(PDFName.of('First'), itemRefs[0]);
    outlines.set(PDFName.of('Last'), itemRefs[itemRefs.length - 1]);
    outlines.set(PDFName.of('Count'), PDFNumber.of(itemRefs.length));
  }
  catalog.set(PDFName.of('Outlines'), outlinesRef);
  catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}
