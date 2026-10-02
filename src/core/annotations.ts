/**
 * Creation of *real* PDF annotation dictionaries (links, comment notes and text
 * markup). These live in `/Annots`, so Acrobat / Preview / Firefox show them in
 * their own comment pane and keep them editable.
 */
import { PDFDocument, PDFPage, pdfLib, hexToRgb } from './pdflib';
import { parseColor } from './geometry';
import type { HighlightObject, NoteObject, Rect, FormFieldObject } from './types';
import { sanitizeUrl } from './security';
import { uid } from './utils';

const { PDFArray, PDFDict, PDFName, PDFNumber, PDFString } = pdfLib;

export function pdfDate(ts = Date.now()): string {
  const d = new Date(ts);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(
    d.getSeconds(),
  )}${sign}${p(Math.floor(abs / 60))}'${p(abs % 60)}'`;
}

const annotBase = (rect: Rect) => ({
  Type: 'Annot',
  Rect: [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h] as number[],
  /**
   * F = flags: Print (4) | Locked? Keep Print so the annotation survives
   * printing, which is what Acrobat does for comments by default.
   */
  F: 4,
});

function registerAnnot(doc: PDFDocument, page: PDFPage, dict: pdfLib.PDFDict): pdfLib.PDFRef {
  const ref = doc.context.register(dict);
  page.node.addAnnot(ref);
  return ref;
}

/** Clickable link annotation (URI action or internal page destination). */
export function addLinkAnnotation(
  doc: PDFDocument,
  page: PDFPage,
  rect: Rect,
  url: string,
  destPageRef?: pdfLib.PDFRef,
): void {
  const safe = sanitizeUrl(url);
  if (!safe && !destPageRef) return;
  const action = destPageRef
    ? { S: 'GoTo', D: [destPageRef, PDFName.of('Fit')] }
    : { S: 'URI', URI: PDFString.of(safe!) };
  const dict = doc.context.obj({
    ...annotBase(rect),
    Subtype: 'Link',
    Border: [0, 0, 0],
    H: 'N',
    A: action,
  });
  registerAnnot(doc, page, dict);
}

/** Sticky-note (Text) annotation — shows up in Acrobat's comment list. */
export function addNoteAnnotation(doc: PDFDocument, page: PDFPage, note: NoteObject, author = 'PDFmaster'): void {
  const color = parseColor(note.color);
  const dict = doc.context.obj({
    ...annotBase({ x: note.x, y: note.y, w: Math.max(14, note.w), h: Math.max(14, note.h) }),
    Subtype: 'Text',
    Name: 'Comment',
    Contents: PDFString.of(note.text || ''),
    T: PDFString.of(note.author || author),
    M: pdfDate(note.createdAt ?? Date.now()),
    C: color,
    ...(note.open ? { Open: true } : {}),
  });
  registerAnnot(doc, page, dict);
}

const SUBTYPE: Record<string, string> = {
  highlight: 'Highlight',
  underline: 'Underline',
  strike: 'StrikeOut',
  squiggly: 'Squiggly',
};

/** Text-markup annotation with /QuadPoints (Acrobat & pdf.js compatible). */
export function addMarkupAnnotation(
  doc: PDFDocument,
  page: PDFPage,
  obj: HighlightObject,
  author = 'PDFmaster',
  comments?: string,
): void {
  if (!obj.quads.length) return;
  const sub = SUBTYPE[obj.kind] ?? 'Highlight';
  const [r, g, b] = parseColor(obj.color);
  const quadPoints: number[] = [];
  for (const q of obj.quads) {
    // PDF spec order per quad: upper-left, upper-right, lower-left, lower-right
    quadPoints.push(q.x, q.y + q.h, q.x + q.w, q.y + q.h, q.x, q.y, q.x + q.w, q.y);
  }
  const quadRect = unionQuadRect(obj.quads);
  const dict = doc.context.obj({
    ...annotBase(quadRect),
    Subtype: sub,
    QuadPoints: quadPoints,
    C: [r, g, b],
    CA: obj.opacity,
    T: PDFString.of(author),
    M: pdfDate(obj.createdAt ?? Date.now()),
    ...(comments ? { Contents: PDFString.of(comments) } : {}),
    ...(obj.text ? { Subj: PDFString.of('Highlight') } : {}),
  });
  registerAnnot(doc, page, dict);
}

function unionQuadRect(quads: Rect[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of quads) {
    x0 = Math.min(x0, q.x);
    y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x + q.w);
    y1 = Math.max(y1, q.y + q.h);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Adds a signature widget placeholder field (used by the digital signing flow)
 * so the cryptographic signature has a visible, populated field.
 */
export function addSignatureField(
  doc: PDFDocument,
  page: PDFPage,
  rect: Rect,
  fieldName = `Signature_${uid('f').slice(0, 6)}`,
): pdfLib.PDFRef | undefined {
  const form = doc.getForm();
  const existing = form.getFields().some((f) => f.getName() === fieldName);
  if (existing) return undefined;
  const field = form.createTextField(fieldName) as unknown as { addToPage: (p: PDFPage, o: object) => void };
  field.addToPage(page, {
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
    borderWidth: 0,
    backgroundColor: undefined,
  });
  const ref = (field as unknown as { ref?: pdfLib.PDFRef }).ref;
  return ref instanceof pdfLib.PDFRef ? ref : undefined;
}

/** Removes every annotation of a given page (used by "remove existing annots"). */
export function stripAnnotations(doc: PDFDocument, page: PDFPage): number {
  const annotsRef = page.node.Annots();
  if (!annotsRef) return 0;
  const annots = doc.context.lookup(annotsRef);
  const count = annots instanceof PDFArray ? annots.size() : 0;
  page.node.delete(PDFName.of('Annots'));
  return count;
}

export function addJavaScript(doc: PDFDocument, script: string, name = 'PDFmasterDocJS'): void {
  if (!script.trim()) return;
  doc.addJavaScript(name, script);
}

/** Creates the /Widget for a form field we modelled as a PDFmaster object. */
export function createFormField(
  doc: PDFDocument,
  page: PDFPage,
  field: FormFieldObject,
  fontName = 'Helvetica',
): void {
  const form = doc.getForm();
  const name = uniqueFieldName(form.getFields().map((f) => f.getName()), field.name || field.field);
  const common = {
    x: field.x,
    y: field.y,
    width: field.w,
    height: field.h,
    borderWidth: 0.75,
    borderColor: hexToRgb('#8b8c94'),
    backgroundColor: hexToRgb(field.field === 'button' ? '#f0f0f2' : '#ffffff'),
  };
  switch (field.field) {
    case 'text': {
      const tf = form.createTextField(name);
      if (field.multiline) tf.enableMultiline();
      tf.setText(field.value ?? '');
      if (field.fontSize) tf.setFontSize(field.fontSize);
      if (field.required) tf.enableRequired();
      tf.addToPage(page, common);
      break;
    }
    case 'checkbox': {
      const cb = form.createCheckBox(name);
      if (field.checked) cb.check();
      cb.addToPage(page, { ...common, borderWidth: 0.75 });
      break;
    }
    case 'radio': {
      const rg = form.createRadioGroup(name);
      const option = field.value || field.group || 'Option 1';
      rg.addOptionToPage(option, page, common);
      if (field.checked) rg.select(option);
      break;
    }
    case 'dropdown': {
      const dd = form.createDropdown(name);
      const options = (field.options ?? []).filter(Boolean);
      if (options.length) dd.setOptions(options);
      if (field.value) dd.select(field.value);
      if (field.fontSize) dd.setFontSize(field.fontSize);
      dd.addToPage(page, common);
      break;
    }
    case 'button': {
      const btn = form.createButton(name);
      btn.addToPage(field.value || field.name || 'Button', page, common);
      break;
    }
  }
  void fontName;
}

function uniqueFieldName(existing: string[], desired: string): string {
  const base = (desired || 'Field').replace(/[^\w\-. ]/g, '_').trim() || 'Field';
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

export { PDFDict, PDFName, PDFNumber, PDFString, PDFArray };
