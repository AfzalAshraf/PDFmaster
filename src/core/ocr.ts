/**
 * OCR (Recognize Text) built on tesseract.js.
 *
 * Pages are rendered at high DPI, recognised, and the words are converted back
 * into PDF user space so the invisible text layer we write at export time lines
 * up exactly with the scanned glyphs underneath.
 *
 * The language data (~10 MB per language) is fetched once and cached by the
 * service worker, so the second run works offline.
 */
import { createWorker, type Worker } from 'tesseract.js';
import type { OcrPageResult, OcrWord, SourceDoc } from './types';
import { getPageProxy } from './registry';

export const OCR_LANGUAGES = [
  { id: 'eng', label: 'English' },
  { id: 'deu', label: 'German' },
  { id: 'fra', label: 'French' },
  { id: 'spa', label: 'Spanish' },
  { id: 'ita', label: 'Italian' },
  { id: 'por', label: 'Portuguese' },
  { id: 'nld', label: 'Dutch' },
  { id: 'pol', label: 'Polish' },
  { id: 'rus', label: 'Russian' },
  { id: 'ukr', label: 'Ukrainian' },
  { id: 'tur', label: 'Turkish' },
  { id: 'ara', label: 'Arabic' },
  { id: 'heb', label: 'Hebrew' },
  { id: 'hin', label: 'Hindi' },
  { id: 'jpn', label: 'Japanese' },
  { id: 'kor', label: 'Korean' },
  { id: 'chi_sim', label: 'Chinese (simplified)' },
  { id: 'chi_tra', label: 'Chinese (traditional)' },
];

export interface OcrProgress {
  page: number;
  totalPages: number;
  status: string;
  progress: number;
}

let worker: Worker | null = null;
let workerLangs = '';

async function getWorker(langs: string, onStatus?: (status: string, progress: number) => void): Promise<Worker> {
  if (worker && workerLangs === langs) return worker;
  if (worker) {
    await worker.terminate();
    worker = null;
  }
  worker = await createWorker(langs, undefined, {
    logger: (m: { status: string; progress: number }) => onStatus?.(m.status, m.progress),
  });
  workerLangs = langs;
  return worker;
}

export async function terminateOcr(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
    workerLangs = '';
  }
}

/** Renders a page to a canvas at the requested scale for recognition. */
async function renderForOcr(source: SourceDoc, index: number, scale: number): Promise<{ canvas: HTMLCanvasElement; viewport: ReturnType<Awaited<ReturnType<typeof getPageProxy>>['getViewport']> }> {
  const page = await getPageProxy(source, index);
  const viewport = page.getViewport({ scale, rotation: page.rotate });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return { canvas, viewport };
}

export async function recognizePage(
  source: SourceDoc,
  index: number,
  langs = 'eng',
  scale = 2.4,
  onStatus?: (status: string, progress: number) => void,
): Promise<OcrPageResult> {
  const { canvas, viewport } = await renderForOcr(source, index, scale);
  const w = await getWorker(langs, onStatus);
  const result = await w.recognize(canvas, {}, { text: true, blocks: true });
  const blocks = (result.data.blocks ?? []) as Array<{
    paragraphs?: Array<{ lines?: Array<{ words?: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }> }> }>;
  }>;
  const words: OcrWord[] = [];
  for (const block of blocks) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text?.trim();
          if (!text) continue;
          // image px (y down) -> PDF user space
          const p1 = viewport.convertToPdfPoint(word.bbox.x0, word.bbox.y0);
          const p2 = viewport.convertToPdfPoint(word.bbox.x1, word.bbox.y1);
          const rect = {
            x: Math.min(p1[0], p2[0]),
            y: Math.min(p1[1], p2[1]),
            w: Math.abs(p2[0] - p1[0]),
            h: Math.abs(p2[1] - p1[1]),
          };
          if (rect.w <= 0 || rect.h <= 0) continue;
          words.push({ text, rect });
        }
      }
    }
  }
  return {
    pageId: '',
    words,
    text: result.data.text ?? '',
    confidence: result.data.confidence ?? 0,
  };
}

/** Concatenates OCR results into a plain text document (per page). */
export function ocrToText(results: OcrPageResult[], pageSeparator = '\n\n--- page break ---\n\n'): string {
  return results.map((r) => r.text.trim()).join(pageSeparator);
}
