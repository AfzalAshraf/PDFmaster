import { describe, expect, it } from 'vitest';
import { parseFontMeta } from '../fonts';

describe('parseFontMeta', () => {
  it('detects bold weights from common BaseFont names', () => {
    expect(parseFontMeta('Arial-Bold').bold).toBe(true);
    expect(parseFontMeta('Times-Bold').bold).toBe(true);
    expect(parseFontMeta('Roboto-Black').bold).toBe(true);
    expect(parseFontMeta('Helvetica-BoldOblique').bold).toBe(true);
    expect(parseFontMeta('DejaVuSansDemi').bold).toBe(true);
  });

  it('does not treat light or book faces as bold', () => {
    expect(parseFontMeta('Arial-Light').bold).toBe(false);
    expect(parseFontMeta('Times-Roman').bold).toBe(false);
    expect(parseFontMeta('SourceSansPro-Book').bold).toBe(false);
  });

  it('detects italic / oblique faces', () => {
    expect(parseFontMeta('Times-Italic').italic).toBe(true);
    expect(parseFontMeta('Helvetica-Oblique').italic).toBe(true);
    expect(parseFontMeta('Arial-BoldItalicMT').italic).toBe(true);
    expect(parseFontMeta('Arial').italic).toBe(false);
  });

  it('classifies serif families and keeps sans families as sans', () => {
    expect(parseFontMeta('Times-Roman').serif).toBe(true);
    expect(parseFontMeta('Georgia').serif).toBe(true);
    expect(parseFontMeta('Garamond').serif).toBe(true);
    expect(parseFontMeta('Simsun').serif).toBe(true);
    expect(parseFontMeta('Arial').serif).toBe(false);
    expect(parseFontMeta('Helvetica').serif).toBe(false);
    expect(parseFontMeta('Roboto-Regular').serif).toBe(false);
  });

  it('ignores subsetting prefixes and resource-style names', () => {
    expect(parseFontMeta('ABCDEF+Arial-BoldMT')).toEqual({ serif: false, bold: true, italic: false });
    expect(parseFontMeta('/F1')).toEqual({ serif: false, bold: false, italic: false });
    expect(parseFontMeta(undefined)).toEqual({ serif: false, bold: false, italic: false });
  });

  it('combines all three attributes', () => {
    expect(parseFontMeta('Times-BoldItalic')).toEqual({ serif: true, bold: true, italic: true });
  });
});
