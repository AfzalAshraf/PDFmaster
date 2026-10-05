import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const PDFJS_VERSION = pdfjs.version;
export const getDocument = pdfjs.getDocument;
export const AnnotationMode = pdfjs.AnnotationMode;
export const AnnotationLayer = pdfjs.AnnotationLayer;
export const TextLayer = pdfjs.TextLayer;
export const PixelsPerInch = pdfjs.PixelsPerInch;
export const PDFWorker = pdfjs.PDFWorker;
export const PasswordResponses = pdfjs.PasswordResponses;

export type PdfDocumentProxy = pdfjs.PDFDocumentProxy;
export type PdfPageProxy = pdfjs.PDFPageProxy;
export type PdfViewport = pdfjs.PageViewport;

/** Root URL of the pdf.js runtime assets (cmaps / fonts / wasm / iccs). */
export function assetRoot(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/pdfjs/`;
}

/**
 * Character maps are required for CJK and other non-latin encodings; the
 * standard font data lets pdf.js render the base-14 fonts without embedding.
 */
export function pdfjsAssets() {
  const root = assetRoot();
  return {
    cMapUrl: `${root}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${root}standard_fonts/`,
    wasmUrl: `${root}wasm/`,
    iccUrl: `${root}iccs/`,
  };
}

export interface OpenOptions {
  password?: string;
  onProgress?: (loaded: number, total: number) => void;
}

export async function openDocument(
  data: Uint8Array,
  { password, onProgress }: OpenOptions = {},
): Promise<pdfjs.PDFDocumentProxy> {
  const task = getDocument({
    data: toArrayBuffer(data),
    ...pdfjsAssets(),
    password,
    // Keep memory bounded for very large documents while allowing big files.
    disableAutoFetch: false,
    disableStream: true,
    useWorkerFetch: true,
    enableXfa: true,
    useSystemFonts: true,
    verbosity: 0,
  });
  if (onProgress) {
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => onProgress(loaded, total);
  }
  return task.promise;
}

export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  // Always copy. pdf.js transfers the buffer into its worker, which detaches
  // it. Returning the original buffer emptied the document and made export
  // and print fail with "No PDF header found".
  return data.slice().buffer as ArrayBuffer;
}

/** Rotation-aware page size in points, as displayed. */
export function viewportSize(page: pdfjs.PDFPageProxy, scale = 1) {
  const viewport = page.getViewport({ scale });
  return { width: viewport.width, height: viewport.height, viewport };
}

export function isPasswordException(err: unknown): boolean {
  return (err as { name?: string })?.name === 'PasswordException';
}

export function isInvalidPdfException(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === 'InvalidPDFException' || name === 'MissingPDFException' || name === 'UnexpectedResponseException';
}

export function pdfErrorMessage(err: unknown): string {
  const e = err as { name?: string; message?: string };
  if (isPasswordException(err)) return 'This PDF is password protected. Enter the password to open it.';
  if (e?.name === 'InvalidPDFException') return 'The file is not a valid PDF or is corrupted.';
  if (e?.name === 'MissingPDFException') return 'The requested file could not be found.';
  if (e?.name === 'UnexpectedResponseException') return 'The server returned an unexpected response.';
  return e?.message || 'Unable to open the document.';
}

export { pdfjs };
