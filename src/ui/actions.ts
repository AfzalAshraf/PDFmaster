/**
 * Shared commands used by the menu bar, ribbon, panels and keyboard shortcuts.
 * Keeping them here means every entry point behaves identically.
 */
import type { BuildInput } from '../core/engine';
import { fileToSource, blankSource } from '../core/importers';
import { exportDocument, exportSplit, type ExportOutput, type ExportRequest } from '../core/exporter';
import { BuildError, type BuildStats } from '../core/engine';
import { recognizePage } from '../core/ocr';
import { getPageTextData } from '../core/registry';
import { loadSession, saveSession, type SavedSession } from '../core/storage';
import { downloadBlobObject, sanitizeFilename, uid } from '../core/utils';
import { getDocument } from '../core/pdfjs';
import { useDoc } from '../state/store';
import { useUI } from '../state/ui';
import { getDesktopBridge } from '../core/desktop';
import { stageFile } from './stagedFile';
import type { ExportOptions, PageId, Rect } from '../core/types';
import { assetFromFile } from '../core/assets';
import { normalizePdfBytes } from '../core/pdfbytes';

export function buildInputFromStore(): BuildInput {
  const state = useDoc.getState();
  return {
    pages: state.pages,
    objectsByPage: Object.fromEntries(
      Object.entries(state.objectsByPage).map(([pageId, ids]) => [
        pageId,
        ids.map((id) => state.objects[id]).filter(Boolean),
      ]),
    ),
    assets: state.assets,
    sources: state.sources,
    crops: state.crops,
    textEdits: state.textEdits,
    ocr: state.ocr,
    meta: state.meta,
    security: state.security,
    watermark: state.watermark,
    headerFooter: state.headerFooter,
    pageNumbers: state.pageNumbers,
    bates: state.bates,
    bookmarks: state.bookmarks,
    attachments: state.attachments,
    options: {},
  };
}

export function defaultExportOptions(): ExportOptions {
  return {
    format: 'pdf',
    quality: 92,
    scale: 2,
    pages: 'all',
    customPages: '',
    pdfA: false,
    embedFonts: false,
    ocr: true,
    flatten: false,
  };
}

/* ------------------------------------------------------------------ */
/* opening                                                            */
/* ------------------------------------------------------------------ */

export function pickFiles(accept = '.pdf,application/pdf,image/*,.txt,.md,.csv,.json,.xml,.html,.docx,.xlsx,.pptx', multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export async function openFilesFromPicker(replace = false): Promise<void> {
  const files = await pickFiles();
  if (files.length) await importFiles(files, { replace });
}

export async function importFiles(
  files: File[],
  options: { replace?: boolean; at?: number } = {},
): Promise<void> {
  const ui = useUI.getState();
  const doc = useDoc.getState();
  if (!files.length) return;
  ui.setBusy({ active: true, label: 'Opening files', progress: 4 });
  const warnings: string[] = [];
  const sources = [];
  try {
    for (const [i, file] of files.entries()) {
      ui.setBusy({ active: true, label: `Opening ${file.name}`, progress: 4 + (i / files.length) * 70 });
      try {
        const result = await fileToSource(file);
        sources.push(result.source);
        warnings.push(...result.warnings);
      } catch (err) {
        ui.toast('error', err instanceof Error ? err.message : `${file.name} could not be opened.`);
      }
    }
    if (!sources.length) return;
    if (options.replace) doc.reset();
    const added = useDoc.getState().addSources(sources, { at: options.at });
    const name = files[0].name.replace(/\.[^.]+$/, '');
    if (options.replace || !useDoc.getState().docName || useDoc.getState().docName === 'Untitled') {
      useDoc.getState().setDocName(sanitizeFilename(files.length === 1 ? name : `${name} +${files.length - 1}`));
    }
    useDoc.getState().markSaved();
    useUI.getState().setStatusMessage(`${added} page${added === 1 ? '' : 's'} added`);
    if (warnings.length) ui.toast('warning', warnings[0]);
    if (!options.replace && useDoc.getState().pages.length === added) {
      useUI.setState({ leftPanel: 'thumbs' });
    }
  } finally {
    ui.setBusy({ active: false, label: '', progress: 0 });
  }
}

export async function createBlankDocument(sizeKey: string, custom?: { w: number; h: number }): Promise<void> {
  const { PAGE_SIZES } = await import('../core/constants');
  const size: [number, number] = custom
    ? [custom.w, custom.h]
    : [PAGE_SIZES[sizeKey]?.w ?? 595.28, PAGE_SIZES[sizeKey]?.h ?? 841.89];
  const source = await blankSource(size);
  useDoc.getState().reset();
  useDoc.getState().addSources([source]);
  useDoc.getState().setDocName('Untitled document');
}

export async function insertPagesFromFiles(at?: number): Promise<void> {
  const files = await pickFiles();
  if (files.length) await importFiles(files, { at });
}

export async function addImageToPage(pageId: PageId, rect?: Rect): Promise<void> {
  const files = await pickFiles('image/*', false);
  const file = files[0];
  if (!file) return;
  const asset = await assetFromFile(file);
  const doc = useDoc.getState();
  doc.addAsset(asset);
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return;
  const target = rect && rect.w > 8 && rect.h > 8 ? rect : fitImage(asset.width, asset.height, page.width, page.height);
  doc.addObject({
    id: uid('obj'),
    pageId,
    kind: 'image',
    x: target.x,
    y: target.y,
    w: target.w,
    h: target.h,
    rotation: 0,
    opacity: 1,
    assetId: asset.id,
    fit: 'contain',
    createdAt: Date.now(),
  });
  useUI.getState().toast('success', 'Image placed.');
}

function fitImage(imgW: number, imgH: number, pageW: number, pageH: number): Rect {
  const maxW = pageW * 0.6;
  const maxH = pageH * 0.6;
  const scale = Math.min(maxW / imgW, maxH / imgH, 1);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

/* ------------------------------------------------------------------ */
/* export & save                                                      */
/* ------------------------------------------------------------------ */

export function currentExportRequest(options: ExportOptions): ExportRequest {
  const doc = useDoc.getState();
  return {
    input: buildInputFromStore(),
    filename: doc.docName || 'document',
    options,
    activePageIndex: useUI.getState().currentPage,
    includeComments: true,
  };
}

/** Result of an export attempt, surfaced verbatim in the Export dialog. */
export interface ExportOutcome {
  ok: boolean;
  filename?: string;
  stats?: BuildStats;
  warnings: string[];
  errors: string[];
}

export async function runExport(
  options: ExportOptions,
  output?: Partial<ExportOutput> & { toast?: boolean },
): Promise<ExportOutcome> {
  const ui = useUI.getState();
  const announce = output?.toast !== false;
  ui.setBusy({ active: true, label: 'Preparing export', progress: 2 });
  try {
    const request = { ...currentExportRequest(options), ...output };
    const result = await exportDocument(
      { ...request, options },
      (progress, label) => useUI.getState().setBusy({ active: true, label, progress }),
    );
    const outcome: ExportOutcome = {
      ok: true,
      filename: result.filename,
      stats: result.stats,
      warnings: result.warnings,
      errors: result.stats?.editErrors ?? [],
    };
    const desktop = getDesktopBridge();
    if (desktop) {
      const saved = await downloadBlobObject(result.blob, result.filename);
      if (saved) {
        if (announce) ui.toast('success', `Saved ${result.filename} to the folder you chose.`);
        useDoc.getState().markSaved();
        return outcome;
      }
    }
    offerDownload(result.blob, result.filename, result.warnings);
    if (announce) {
      if (outcome.errors.length) ui.toast('error', outcome.errors[0]);
      else if (outcome.warnings.length) ui.toast('warning', outcome.warnings[0]);
      ui.toast(
        'success',
        `${result.filename} is ready. Click Download — it goes to your browser’s Downloads folder. This preview cannot pick a folder by itself.`,
      );
      if (result.stats && (result.stats.editsFailed > 0 || result.stats.redactions > 0 || result.stats.ocrReplaced > 0)) {
        const parts = [`${result.stats.editsApplied} text edit(s) applied`];
        if (result.stats.redactions > 0) parts.push(`${result.stats.redactions} redacted run(s) removed`);
        if (result.stats.ocrReplaced > 0) parts.push(`${result.stats.ocrReplaced} OCR word(s) replaced`);
        if (result.stats.editsFailed > 0) parts.push(`${result.stats.editsFailed} failed`);
        ui.toast('info', `${parts.join(', ')}.`);
      }
    }
    useDoc.getState().markSaved();
    return outcome;
  } catch (err) {
    const errors =
      err instanceof BuildError
        ? [err.message, ...err.details]
        : [err instanceof Error ? err.message : 'Export failed.'];
    if (announce) ui.toast('error', errors[0]);
    return { ok: false, warnings: [], errors };
  } finally {
    ui.setBusy({ active: false, label: '', progress: 0 });
  }
}

export async function quickSave(): Promise<void> {
  await runExport({ ...defaultExportOptions(), format: 'pdf' });
}

/** Stage a built file and open the download sheet. Does not claim a folder was chosen. */
export function offerDownload(blob: Blob, filename: string, warnings: string[] = []): void {
  const staged = stageFile(blob, filename, warnings);
  useUI.getState().setFileOffer({
    id: staged.id,
    filename: staged.filename,
    bytes: staged.bytes,
    mime: staged.mime,
    warnings: staged.warnings,
  });
}

export async function saveSplit(groups: number[][]): Promise<void> {
  const ui = useUI.getState();
  ui.setBusy({ active: true, label: 'Splitting document', progress: 3 });
  try {
    const request = currentExportRequest({ ...defaultExportOptions(), format: 'pdf' });
    const result = await exportSplit(request, groups, (progress, label) =>
      useUI.getState().setBusy({ active: true, label, progress }),
    );
    offerDownload(result.blob, result.filename, result.warnings);
    ui.toast('success', `${result.filename} is ready. Click Download — it goes to your browser’s Downloads folder.`);
  } catch (err) {
    ui.toast('error', err instanceof Error ? err.message : 'Split failed.');
  } finally {
    ui.setBusy({ active: false, label: '', progress: 0 });
  }
}

export async function printDocument(): Promise<void> {
  const ui = useUI.getState();
  ui.setBusy({ active: true, label: 'Preparing print preview', progress: 5 });
  try {
    const options: ExportOptions = { ...defaultExportOptions(), format: 'pdf', flatten: true };
    const request = currentExportRequest(options);
    const { buildPdf } = await import('../core/engine');
    const result = await buildPdf({ ...request.input, options: { ...request.input.options, flattenForms: true } });
    const filename = `${sanitizeFilename(useDoc.getState().docName)}.pdf`;
    const blob = new Blob([result.bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
    offerDownload(blob, filename, result.warnings);
    ui.toast('success', `${filename} is ready to print. Download it, or use Print in the dialog.`);
  } catch (err) {
    ui.toast('error', err instanceof Error ? err.message : 'Print failed.');
  } finally {
    ui.setBusy({ active: false, label: '', progress: 0 });
  }
}

/* ------------------------------------------------------------------ */
/* OCR                                                                */
/* ------------------------------------------------------------------ */

export async function runOcr(pageIds: PageId[], langs: string, scale: number): Promise<void> {
  const doc = useDoc.getState();
  const ui = useUI.getState();
  const pages = doc.pages.filter((p) => !p.deleted && (pageIds.length === 0 || pageIds.includes(p.id)));
  if (!pages.length) {
    ui.toast('warning', 'Select at least one page to recognise.');
    return;
  }
  ui.setBusy({ active: true, label: 'Starting OCR engine', progress: 2 });
  try {
    for (const [i, page] of pages.entries()) {
      const source = useDoc.getState().sources[page.sourceId];
      if (!source) continue;
      useUI.getState().setBusy({
        active: true,
        label: `Recognising page ${i + 1} of ${pages.length}`,
        progress: (i / pages.length) * 100,
      });
      const result = await recognizePage(source, page.sourceIndex, langs, scale, (status, progress) => {
        useUI.getState().setBusy({
          active: true,
          label: `Recognising page ${i + 1} of ${pages.length} — ${status}`,
          progress: ((i + progress) / pages.length) * 100,
        });
      });
      useDoc.getState().setOcr(page.id, { ...result, pageId: page.id });
    }
    ui.toast('success', `OCR complete for ${pages.length} page(s). The text layer is added on export.`);
  } catch (err) {
    ui.toast('error', err instanceof Error ? err.message : 'OCR failed.');
  } finally {
    ui.setBusy({ active: false, label: '', progress: 0 });
  }
}

/* ------------------------------------------------------------------ */
/* session persistence                                                */
/* ------------------------------------------------------------------ */

export async function restoreAutosavedSession(): Promise<boolean> {
  try {
    const session = await loadSession();
    if (!session?.pages?.length || !session.sources?.length) return false;
    useDoc.getState().loadSession(session);
    return true;
  } catch {
    return false;
  }
}

export async function saveProjectFile(): Promise<void> {
  const session = useDoc.getState().toSession();
  const blob = new Blob([JSON.stringify({ ...session, kind: 'pdfmaster-project' })], { type: 'application/json' });
  const filename = `${sanitizeFilename(useDoc.getState().docName)}.pdfmaster.json`;
  offerDownload(blob, filename);
  useDoc.getState().markSaved();
  useUI.getState().toast('success', `${filename} is ready. Click Download — it goes to your browser’s Downloads folder.`);
}

export async function openProjectFile(file: File): Promise<void> {
  const text = await file.text();
  const parsed = JSON.parse(text) as SavedSession & { kind?: string };
  if (!parsed.pages || !parsed.sources) throw new Error('This is not a PDFmaster project file.');
  const sources = parsed.sources.map((source) => {
    const bytes = normalizePdfBytes(source.bytes);
    return { ...source, bytes, size: bytes.byteLength || source.size };
  });
  useDoc.getState().loadSession({ ...parsed, sources });
  await saveSession({ ...parsed, sources });
  useUI.getState().toast('success', 'Project restored.');
}

/* ------------------------------------------------------------------ */
/* misc                                                               */
/* ------------------------------------------------------------------ */

/** Page count of the built output — used by the export dialog preview. */
export async function countTextRuns(pageId: PageId): Promise<number> {
  const doc = useDoc.getState();
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return 0;
  const source = doc.sources[page.sourceId];
  if (!source) return 0;
  const data = await getPageTextData(source, page.sourceIndex);
  return data.items.length;
}

export async function pageHasTextLayer(pageId: PageId): Promise<boolean> {
  const doc = useDoc.getState();
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return false;
  const source = doc.sources[page.sourceId];
  if (!source) return false;
  const data = await getPageTextData(source, page.sourceIndex);
  return data.text.trim().length > 20;
}

export async function documentPageCount(bytes: Uint8Array): Promise<number> {
  const proxy = await getDocument({ data: bytes.slice().buffer as ArrayBuffer, verbosity: 0 }).promise;
  const count = proxy.numPages;
  await (proxy as unknown as { destroy?: () => Promise<void> }).destroy?.().catch(() => {});
  return count;
}
