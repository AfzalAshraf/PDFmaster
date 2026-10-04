/**
 * Export pipeline.
 *
 * Everything is derived from *one* built PDF: raster images, text, Office
 * formats and the archive exports all read the same bytes, so what you export
 * is byte-for-byte what you saw in the editor.
 */
import JSZip from 'jszip';
import { buildPdf, BuildError, type BuildInput, type BuildResult, type ProgressFn } from './engine';
import { getDocument, type PdfDocumentProxy } from './pdfjs';
import { bytesToBlob, csvEscape, sanitizeFilename } from './utils';
import type { ExportFormat, ExportOptions } from './types';

export interface ExportRequest {
  input: BuildInput;
  filename: string;
  options: ExportOptions;
  activePageIndex: number;
  /** Include comment texts in text-based exports. */
  includeComments?: boolean;
}

export interface ExportOutput {
  blob: Blob;
  filename: string;
  warnings: string[];
  stats?: BuildResult['stats'];
}

export const EXPORT_FORMATS: { id: ExportFormat; label: string; group: string; hint: string }[] = [
  { id: 'pdf', label: 'PDF', group: 'pdf', hint: 'Standard PDF' },
  { id: 'pdf-a', label: 'PDF/A-2b', group: 'pdf', hint: 'Long-term archival' },
  { id: 'pdf-flat', label: 'Flattened PDF', group: 'pdf', hint: 'Annotations become page content, forms flattened' },
  { id: 'png', label: 'PNG image', group: 'image', hint: 'Lossless raster (ZIP for multi-page)' },
  { id: 'jpeg', label: 'JPEG image', group: 'image', hint: 'Lossy raster, smaller files' },
  { id: 'webp', label: 'WebP image', group: 'image', hint: 'Modern raster format' },
  { id: 'svg-flat', label: 'SVG (page image)', group: 'image', hint: 'Vector container with the page raster' },
  { id: 'txt', label: 'Text (.txt)', group: 'text', hint: 'Plain text, layout aware' },
  { id: 'md', label: 'Markdown (.md)', group: 'text', hint: 'Headings per page + comment appendix' },
  { id: 'html', label: 'HTML', group: 'text', hint: 'Self-contained web page' },
  { id: 'csv', label: 'CSV', group: 'text', hint: 'One row per text line' },
  { id: 'json', label: 'JSON', group: 'text', hint: 'Structured document data' },
  { id: 'docx', label: 'Word (.docx)', group: 'office', hint: 'Editable Word document (text + layout)' },
  { id: 'xlsx', label: 'Excel (.xlsx)', group: 'office', hint: 'One sheet per page' },
  { id: 'pptx', label: 'PowerPoint (.pptx)', group: 'office', hint: 'One slide per page' },
];

/** Builds the PDF once and returns everything derived from it. */
async function materialise(req: ExportRequest, onProgress?: ProgressFn): Promise<{ result: BuildResult; filename: string }> {
  const result = await buildPdf(req.input, onProgress);
  return { result, filename: sanitizeFilename(req.filename, 'document') };
}

export async function exportDocument(req: ExportRequest, onProgress?: ProgressFn): Promise<ExportOutput> {
  const { options } = req;
  const base: BuildInput = {
    ...req.input,
    options: {
      ...req.input.options,
      pdfA: options.format === 'pdf-a' || options.pdfA,
      flattenForms: options.format === 'pdf-flat' ? true : (options.flatten ?? req.input.options?.flattenForms),
      keepComments: options.format === 'pdf-flat' ? false : true,
      ocr: options.ocr !== false,
    },
  };
  const request: ExportRequest = { ...req, input: base };

  switch (options.format) {
    case 'pdf':
    case 'pdf-a':
    case 'pdf-flat': {
      const { result, filename } = await materialise(request, onProgress);
      if (options.format === 'pdf-a' && !result.warnings.some((w) => /PDF\/A/.test(w))) {
        result.warnings.push('PDF/A written: fonts used by PDFmaster are embedded, but validate with veraPDF for archival use.');
      }
      return {
        blob: bytesToBlob(result.bytes, 'application/pdf'),
        filename: `${filename}${options.format === 'pdf-a' ? '-pdfa' : ''}.pdf`,
        warnings: result.warnings,
        stats: result.stats,
      };
    }
    case 'png':
    case 'jpeg':
    case 'webp':
    case 'svg-flat':
      return exportRaster(request, onProgress);
    default:
      return exportTextLike(request, onProgress);
  }
}

/* ------------------------------------------------------------------ */
/* raster                                                             */
/* ------------------------------------------------------------------ */

function pageIndices(req: ExportRequest): number[] {
  const total = req.input.pages.filter((p) => !p.deleted).length;
  if (req.options.pages === 'current') return [Math.min(req.activePageIndex, total - 1)];
  if (req.options.pages === 'custom') {
    const parsed = (req.options.customPages || '')
      .split(/[,;\s]+/)
      .flatMap((part) => {
        const m = part.match(/^(\d+)?-?(\d+)?$/);
        if (!m || (!m[1] && !m[2])) return [];
        const start = Number(m[1] || m[2]);
        const end = Number(m[2] || m[1]);
        return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i - 1);
      })
      .filter((i) => i >= 0 && i < total);
    return parsed.length ? parsed : Array.from({ length: total }, (_, i) => i);
  }
  return Array.from({ length: total }, (_, i) => i);
}

async function renderPages(
  proxy: PdfDocumentProxy,
  indices: number[],
  scale: number,
  type: 'image/png' | 'image/jpeg' | 'image/webp',
  quality: number,
): Promise<Array<{ index: number; blob: Blob; width: number; height: number }>> {
  const out: Array<{ index: number; blob: Blob; width: number; height: number }> = [];
  for (const index of indices) {
    const page = await proxy.getPage(index + 1);
    const viewport = page.getViewport({ scale, rotation: page.rotate });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
    if (!blob) throw new Error('The page could not be rasterised.');
    out.push({ index, blob, width: canvas.width, height: canvas.height });
  }
  return out;
}

async function exportRaster(req: ExportRequest, onProgress?: ProgressFn): Promise<ExportOutput> {
  const { result, filename } = await materialise(req, onProgress);
  onProgress?.(95, 'Rendering images');
  const proxy = await getDocument({ data: result.bytes.slice().buffer, verbosity: 0 }).promise;
  try {
    const indices = pageIndices(req);
    const format = req.options.format;
    const type = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : format === 'webp' ? 'webp' : 'png';
    const rendered = await renderPages(proxy, indices, req.options.scale || 2, type, (req.options.quality || 90) / 100);

    if (format === 'svg-flat') {
      const zip = new JSZip();
      for (const page of rendered) {
        const dataUrl = await blobToDataUrl(page.blob);
        const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}">\n  <image width="${page.width}" height="${page.height}" xlink:href="${dataUrl}"/>\n</svg>\n`;
        zip.file(`${filename}-page-${String(page.index + 1).padStart(3, '0')}.svg`, svg);
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      return { blob, filename: `${filename}-svg.zip`, warnings: result.warnings, stats: result.stats };
    }

    if (rendered.length === 1) {
      return {
        blob: rendered[0].blob,
        filename: `${filename}-page-${rendered[0].index + 1}.${ext}`,
        warnings: result.warnings,
        stats: result.stats,
      };
    }
    const zip = new JSZip();
    for (const page of rendered) {
      zip.file(`${filename}-page-${String(page.index + 1).padStart(3, '0')}.${ext}`, page.blob);
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    return { blob, filename: `${filename}-${ext}.zip`, warnings: result.warnings, stats: result.stats };
  } finally {
    await (proxy as unknown as { destroy?: () => Promise<void> }).destroy?.().catch(() => {});
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/* ------------------------------------------------------------------ */
/* text based formats                                                 */
/* ------------------------------------------------------------------ */

export interface PageText {
  pageIndex: number;
  lines: string[];
  text: string;
}

export async function extractPageTexts(bytes: Uint8Array, indices?: number[]): Promise<PageText[]> {
  const proxy = await getDocument({ data: bytes.slice().buffer, verbosity: 0 }).promise;
  try {
    const total = proxy.numPages;
    const list = indices ?? Array.from({ length: total }, (_, i) => i);
    const pages: PageText[] = [];
    for (const index of list) {
      const page = await proxy.getPage(index + 1);
      const content = await page.getTextContent();
      const items = content.items
        .map((raw) => raw as { str?: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean })
        .filter((item) => item.str !== undefined && item.transform);
      // group runs into visual lines by their baseline y
      const rows = new Map<number, { x: number; str: string }[]>();
      for (const item of items) {
        const y = Math.round((item.transform![5] as number) / 2) * 2;
        const bucket = rows.get(y) ?? [];
        bucket.push({ x: item.transform![4] as number, str: item.str! });
        rows.set(y, bucket);
      }
      const lines = [...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, bucket]) =>
          bucket
            .sort((a, b) => a.x - b.x)
            .map((entry) => entry.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim(),
        )
        .filter((line) => line.length > 0);
      pages.push({ pageIndex: index, lines, text: lines.join('\n') });
    }
    return pages;
  } finally {
    await (proxy as unknown as { destroy?: () => Promise<void> }).destroy?.().catch(() => {});
  }
}

function commentAppendix(input: BuildInput): string[] {
  const lines: string[] = [];
  for (const page of input.pages) {
    for (const obj of input.objectsByPage[page.id] ?? []) {
      if (obj.kind === 'note' && obj.text.trim()) lines.push(`Page ${page.index + 1} — ${obj.text.trim()}`);
      if ((obj.kind === 'highlight' || obj.kind === 'underline' || obj.kind === 'strike' || obj.kind === 'squiggly') && obj.text?.trim()) {
        lines.push(`Page ${page.index + 1} — marked "${obj.text.trim()}"`);
      }
    }
  }
  return lines;
}

async function exportTextLike(req: ExportRequest, onProgress?: ProgressFn): Promise<ExportOutput> {
  const { result, filename } = await materialise(req, onProgress);
  const pages = await extractPageTexts(result.bytes, pageIndices(req));
  const warnings = [...result.warnings];
  const comments = req.includeComments === false ? [] : commentAppendix(req.input);

  switch (req.options.format) {
    case 'txt': {
      const body = pages.map((p) => p.text).join('\n\n');
      const appendix = comments.length ? `\n\n--- Comments ---\n${comments.join('\n')}\n` : '';
      return { blob: new Blob([body + appendix], { type: 'text/plain;charset=utf-8' }), filename: `${filename}.txt`, warnings };
    }
    case 'md': {
      const body = pages
        .map((p) => `## Page ${p.pageIndex + 1}\n\n${p.text}\n`)
        .join('\n');
      const appendix = comments.length ? `\n## Comments\n\n${comments.map((c) => `- ${c}`).join('\n')}\n` : '';
      return {
        blob: new Blob([`# ${req.input.meta.title || filename}\n\n${body}${appendix}`], { type: 'text/markdown;charset=utf-8' }),
        filename: `${filename}.md`,
        warnings,
      };
    }
    case 'html': {
      const body = pages
        .map(
          (p) =>
            `<section class="page"><h2>Page ${p.pageIndex + 1}</h2>${p.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</section>`,
        )
        .join('\n');
      const appendix = comments.length
        ? `<section class="comments"><h2>Comments</h2><ul>${comments.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul></section>`
        : '';
      const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(req.input.meta.title || filename)}</title>
<style>
 body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#1c1d21;margin:0;padding:32px}
 main{max-width:820px;margin:0 auto}
 .page{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.12);padding:28px 32px;margin-bottom:22px}
 h1{font-size:22px;margin:0 0 18px} h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#8b8c94;margin:0 0 12px}
 p{margin:0 0 8px;line-height:1.55;white-space:pre-wrap}
 .comments ul{padding-left:18px}
</style></head>
<body><main><h1>${escapeHtml(req.input.meta.title || filename)}</h1>${body}${appendix}</main></body></html>`;
      return { blob: new Blob([html], { type: 'text/html;charset=utf-8' }), filename: `${filename}.html`, warnings };
    }
    case 'csv': {
      const rows = ['page,line,text'];
      for (const page of pages) {
        page.lines.forEach((line, i) => rows.push(`${page.pageIndex + 1},${i + 1},${csvEscape(line)}`));
      }
      return { blob: new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }), filename: `${filename}.csv`, warnings };
    }
    case 'json': {
      const payload = {
        filename,
        meta: req.input.meta,
        pages: pages.map((page) => ({
          page: page.pageIndex + 1,
          lines: page.lines,
          text: page.text,
        })),
        annotations: Object.values(req.input.objectsByPage).flat(),
        comments,
      };
      return {
        blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
        filename: `${filename}.json`,
        warnings,
      };
    }
    case 'docx':
      return { blob: await makeDocx(req, pages, comments), filename: `${filename}.docx`, warnings };
    case 'xlsx':
      return { blob: await makeXlsx(pages, comments), filename: `${filename}.xlsx`, warnings };
    case 'pptx':
      return { blob: await makePptx(req, pages), filename: `${filename}.pptx`, warnings };
    default:
      throw new BuildError(`Unsupported export format: ${req.options.format}`);
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/* ------------------------------------------------------------------ */
/* OOXML writers (minimal, standards compliant)                       */
/* ------------------------------------------------------------------ */

async function makeDocx(req: ExportRequest, pages: PageText[], comments: string[]): Promise<Blob> {
  const zip = new JSZip();
  const paragraphs: string[] = [];
  paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t xml:space="preserve">${xmlEscape(req.input.meta.title || req.filename)}</w:t></w:r></w:p>`);
  for (const page of pages) {
    paragraphs.push(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">Page ${page.pageIndex + 1}</w:t></w:r></w:p>`,
    );
    for (const line of page.lines) {
      paragraphs.push(`<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`);
    }
  }
  if (comments.length) {
    paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Comments</w:t></w:r></w:p>`);
    for (const comment of comments) {
      paragraphs.push(`<w:p><w:r><w:t xml:space="preserve">${xmlEscape(comment)}</w:t></w:r></w:p>`);
    }
  }
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:sz w:val="48"/><w:b/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:sz w:val="30"/><w:b/><w:color w:val="555555"/></w:rPr></w:style></w:styles>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

async function makeXlsx(pages: PageText[], comments: string[]): Promise<Blob> {
  const zip = new JSZip();
  const sheetCount = pages.length + (comments.length ? 1 : 0);
  const sheets: string[] = [];
  const rels: string[] = [];
  const overrides: string[] = [];
  const writeSheet = (index: number, title: string, rows: string[][]) => {
    const sheetRows = rows
      .map((row, r) => {
        const cells = row
          .map((cell, c) => `<c r="${columnName(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`)
          .join('');
        return `<row r="${r + 1}">${cells}</row>`;
      })
      .join('');
    sheets.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
    rels.push(`<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`);
    overrides.push(`<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    return title;
  };
  const titles = pages.map((page, i) => writeSheet(i, `Page ${page.pageIndex + 1}`, page.lines.map((l) => [l])));
  if (comments.length) titles.push(writeSheet(pages.length, 'Comments', comments.map((c) => [c])));
  const sheetXml = titles
    .map((title, i) => `<sheet name="${xmlEscape(title).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides.join('')}</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetXml}</sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`,
  );
  sheets.forEach((sheet, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheet));
  void sheetCount;
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function columnName(index: number): string {
  let n = index;
  let name = '';
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

async function makePptx(req: ExportRequest, pages: PageText[]): Promise<Blob> {
  const zip = new JSZip();
  const slideCount = pages.length;
  const overrides: string[] = [];
  const rels: string[] = [];
  for (let i = 0; i < slideCount; i++) {
    const page = pages[i];
    const body = page.lines
      .slice(0, 14)
      .map(
        (line) =>
          `<a:p><a:r><a:rPr lang="en-US" sz="1400"/><a:t>${xmlEscape(line.slice(0, 200))}</a:t></a:r></a:p>`,
      )
      .join('');
    const title = `Page ${page.pageIndex + 1}`;
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2400" b="1"/><a:t>${xmlEscape(title)}</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="838200" y="1825625"/><a:ext cx="10515600" cy="4351338"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${body || '<a:p/>'}</p:txBody></p:sp>
</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    );
    zip.file(
      `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
    );
    rels.push(
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`,
    );
    overrides.push(
      `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    );
  }
  const sldIds = pages
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`)
    .join('');
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${overrides.join('')}</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
  );
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`,
  );
  void req;
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

/* ------------------------------------------------------------------ */
/* archives                                                           */
/* ------------------------------------------------------------------ */

/** Splits the document into one PDF per page (or per custom group). */
export async function exportSplit(req: ExportRequest, groups: number[][], onProgress?: ProgressFn): Promise<ExportOutput> {
  const zip = new JSZip();
  const activePages = req.input.pages.filter((p) => !p.deleted);
  const warnings: string[] = [];
  for (const [i, group] of groups.entries()) {
    const subset = group.map((index) => activePages[index]).filter(Boolean);
    if (!subset.length) continue;
    const result = await buildPdf(
      { ...req.input, pages: subset.map((page, idx) => ({ ...page, index: idx })) },
      (pct, label) => onProgress?.(pct, `${label} (part ${i + 1})`),
    );
    warnings.push(...result.warnings);
    zip.file(`${sanitizeFilename(req.filename)}-part-${String(i + 1).padStart(2, '0')}.pdf`, result.bytes);
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, filename: `${sanitizeFilename(req.filename)}-split.zip`, warnings };
}
