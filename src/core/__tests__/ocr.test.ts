import { describe, expect, it } from 'vitest';
import { PDFDocument } from '../pdflib';
import { coverRectForWord, planOcrReplacements, sampleWordBackground, type OcrReplacePlan } from '../ocr';
import type { OcrReplacement, OcrWord } from '../types';

const words: OcrWord[] = [
  { text: 'Good', rect: { x: 72, y: 700, w: 40, h: 14 } },
  { text: 'Strategy', rect: { x: 120, y: 700, w: 58, h: 14 } },
  { text: 'and', rect: { x: 186, y: 700, w: 24, h: 14 } },
  { text: 'bad', rect: { x: 218, y: 700, w: 30, h: 14 } },
];

const rep = (original: string, text: string, extra: Partial<OcrReplacement> = {}): OcrReplacement => ({
  id: `r-${original}`,
  original,
  text,
  ...extra,
});

describe('planOcrReplacements', () => {
  it('replaces every occurrence of the original word', () => {
    const list: OcrWord[] = [...words, { text: 'Strategy', rect: { x: 300, y: 500, w: 58, h: 14 } }];
    const plan = planOcrReplacements(list, [rep('Strategy', 'Tactics')]);
    expect(plan.replace.size).toBe(2);
    expect(plan.replace.get(1)?.text).toBe('Tactics');
    expect(plan.replace.get(4)?.text).toBe('Tactics');
    expect(plan.unmatched).toHaveLength(0);
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    const plan = planOcrReplacements(words, [rep('  good ', 'GREAT')]);
    expect(plan.replace.get(0)?.text).toBe('GREAT');
    expect(plan.unmatched).toHaveLength(0);
  });

  it('reports replacements that match no recognised word', () => {
    const plan = planOcrReplacements(words, [rep('nonexistent', 'x')]);
    expect(plan.replace.size).toBe(0);
    expect(plan.unmatched.map((r) => r.original)).toEqual(['nonexistent']);
  });

  it('ignores empty originals instead of matching everything', () => {
    const plan = planOcrReplacements(words, [rep('   ', 'x')]);
    expect(plan.replace.size).toBe(0);
    expect(plan.unmatched).toHaveLength(1);
  });

  it('lets the later replacement win when two target the same word', () => {
    const plan = planOcrReplacements(words, [rep('bad', 'fine'), rep('bad', 'great')]);
    expect(plan.replace.get(3)?.text).toBe('great');
  });

  it('targets one word when wordIndex is set, leaving other matches alone', () => {
    const list: OcrWord[] = [...words, { text: 'Strategy', rect: { x: 300, y: 500, w: 58, h: 14 } }];
    const plan = planOcrReplacements(list, [rep('Strategy', 'Tactics', { wordIndex: 1 })]);
    expect(plan.replace.size).toBe(1);
    expect(plan.replace.get(1)?.text).toBe('Tactics');
    expect(plan.replace.has(4)).toBe(false);
  });

  it('keeps the sampled background colour for the covering box', () => {
    const plan: OcrReplacePlan = planOcrReplacements(words, [rep('and', '&', { bg: '#f2efe9' })]);
    expect(plan.replace.get(2)?.bg).toBe('#f2efe9');
  });

  it('pads the covering rect slightly beyond the word', () => {
    const cover = coverRectForWord({ x: 100, y: 200, w: 50, h: 14 });
    expect(cover.x).toBeLessThan(100);
    expect(cover.y).toBeLessThan(200);
    expect(cover.w).toBeGreaterThan(50);
    expect(cover.h).toBeGreaterThan(14);
  });

  it('falls back to white when the page cannot be sampled', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    const bytes = await doc.save();
    const source = {
      id: 'src1',
      name: 'scan.pdf',
      bytes,
      pageCount: 1,
      size: bytes.length,
      loadedAt: Date.now(),
    };
    const bg = await sampleWordBackground(source, 0, { x: 72, y: 700, w: 50, h: 14 });
    expect(bg).toBe('#ffffff');
  });
});
