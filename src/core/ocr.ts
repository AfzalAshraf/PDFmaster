/**
 * OCR (Recognize Text) built on tesseract.js.
 *
 * Pages are rendered at high DPI, recognised, and the words are converted back
 * into PDF user space so the invisible text layer we write at export time lines
 * up exactly with the scanned glyphs underneath.
 *
 * Language data (~10 MB per language) is downloaded on first use and cached
 * locally by Tesseract, so repeat runs can work offline.
 */
import { createWorker, type Worker } from 'tesseract.js';
import type { OcrPageResult, OcrReplacement, OcrWord, Rect, SourceDoc } from './types';
import { getPageProxy } from './registry';
import { normalizeText } from './utils';

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

/* ------------------------------------------------------------------ */
/* word replacement (drawn over the scan at export time)              */
/* ------------------------------------------------------------------ */

export interface OcrReplacePlan {
  /** word index -> visible replacement text to draw over the raster word. */
  replace: Map<number, { text: string; bg?: string }>;
  /** originals that matched no recognised word on the page. */
  unmatched: OcrReplacement[];
}

/**
 * Matches each replacement against the recognised words. Every occurrence of
 * the original word is replaced; when two replacements target the same word
 * the later one wins. Pure and deterministic so it is easy to test.
 */
export function planOcrReplacements(words: OcrWord[], replacements: OcrReplacement[]): OcrReplacePlan {
  const replace = new Map<number, { text: string; bg?: string }>();
  const unmatched: OcrReplacement[] = [];
  for (const replacement of replacements) {
    const target = normalizeText(replacement.original).trim();
    if (!target) {
      unmatched.push(replacement);
      continue;
    }
    let hit = false;
    words.forEach((word, index) => {
      if (normalizeText(word.text).trim() === target) {
        replace.set(index, { text: replacement.text, bg: replacement.bg });
        hit = true;
      }
    });
    if (!hit) unmatched.push(replacement);
  }
  return { replace, unmatched };
}

/** A slightly enlarged version of a word rect, for the covering box. */
export function coverRectForWord(rect: Rect): Rect {
  const padX = Math.max(1, rect.w * 0.04);
  const padY = Math.max(1, rect.h * 0.08);
  return { x: rect.x - padX, y: rect.y - padY, w: rect.w + padX * 2, h: rect.h + padY * 2 };
}

/**
 * Samples the pixels immediately surrounding a word on a rendered page and
 * returns a hex colour for the covering box, so a replacement blends into the
 * scan's background (usually paper white, but it can be off-white or grey).
 * Falls back to white when the page or canvas is unavailable.
 */
export async function sampleWordBackground(source: SourceDoc, index: number, rect: Rect): Promise<string> {
  try {
    const { canvas, viewport } = await renderForOcr(source, index, 2);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '#ffffff';
    // PDF space -> canvas pixels (y down).
    const toPx = (x: number, y: number): [number, number] => {
      const p = viewport.convertToViewportPoint(x, y);
      return [p[0], p[1]];
    };
    const [x0, y0] = toPx(rect.x, rect.y + rect.h);
    const [x1, y1] = toPx(rect.x + rect.w, rect.y);
    const left = Math.max(0, Math.floor(Math.min(x0, x1)) - 3);
    const right = Math.min(canvas.width, Math.ceil(Math.max(x0, x1)) + 3);
    const top = Math.max(0, Math.floor(Math.min(y0, y1)) - 3);
    const bottom = Math.min(canvas.height, Math.ceil(Math.max(y0, y1)) + 3);
    const samples: number[] = [];
    const push = (px: number, py: number) => {
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return;
      const d = ctx.getImageData(px, py, 1, 1).data;
      samples.push(d[0], d[1], d[2]);
    };
    // Border ring just outside the word: top & bottom rows, left & right cols.
    for (let x = left; x < right; x += 2) {
      push(x, top);
      push(x, bottom - 1);
    }
    for (let y = top; y < bottom; y += 2) {
      push(left, y);
      push(right - 1, y);
    }
    if (!samples.length) return '#ffffff';
    // Take the lightest dominant colour: scans are light, and we want a box
    // that does not darken the surrounding page.
    const avg = [0, 1, 2].map((i) => samples.reduce((sum, v, j) => (j % 3 === i ? sum + v : sum), 0) / (samples.length / 3));
    const luminance = (0.299 * avg[0] + 0.587 * avg[1] + 0.114 * avg[2]) / 255;
    if (luminance < 0.5) return '#ffffff'; // dark surroundings: don't smear it
    const hex = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    return `#${hex(avg[0])}${hex(avg[1])}${hex(avg[2])}`;
  } catch {
    return '#ffffff';
  }
}
