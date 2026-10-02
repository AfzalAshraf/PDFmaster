/**
 * Core domain types for PDFmaster.
 *
 * Coordinate conventions (important!):
 *  - Objects are stored in **PDF user space**: origin bottom-left, y axis up,
 *    units are 1/72 inch (points). x/y is the *lower-left* corner of the object
 *    box, w/h its size, `rotation` degrees counter-clockwise about its centre.
 *  - Rendering converts PDF space -> screen through the pdf.js viewport
 *    matrix, so rotated pages and arbitrary zoom "just work" (see geometry.ts).
 *  - Text-markup objects store true quadrilaterals (`Quad`) in PDF space so
 *    highlighting follows rotated / skewed text runs.
 */

export type Matrix = [number, number, number, number, number, number];

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned quad in PDF space (y up). */
export interface Quad extends Rect {
  /** Group id: consecutive quads that belong to the same logical run. */
  groupId?: string;
}

export type PageId = string;
export type ObjectId = string;

export type AnnotationKind =
  | 'highlight'
  | 'underline'
  | 'strike'
  | 'squiggly'
  | 'note'
  | 'textbox'
  | 'ink'
  | 'shape'
  | 'stamp'
  | 'signature'
  | 'image'
  | 'redact'
  | 'measure'
  | 'link'
  | 'formfield'
  | 'whiteout';

export interface BaseObject {
  id: ObjectId;
  pageId: PageId;
  kind: AnnotationKind;
  /** Lower-left corner in PDF user space. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked?: boolean;
  /** Set when the object was produced by an edit on an existing PDF page. */
  createdAt?: number;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  /** Optional background fill for text boxes / callouts. */
  fill?: string | null;
  /** Optional border colour for text boxes / callouts. */
  border?: string | null;
  borderWidth?: number;
}

export interface HighlightObject extends BaseObject {
  kind: 'highlight' | 'underline' | 'strike' | 'squiggly';
  quads: Quad[];
  color: string;
  /** Extracted covered text, used for the comments list and for search. */
  text?: string;
}

export interface NoteObject extends BaseObject {
  kind: 'note';
  color: string;
  text: string;
  author?: string;
  /** Whether the note popup is pinned open on the page. */
  open?: boolean;
}

export interface TextBoxObject extends BaseObject {
  kind: 'textbox';
  text: string;
  style: TextStyle;
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'cloud';

export interface ShapeObject extends BaseObject {
  kind: 'shape';
  shape: ShapeKind;
  /** Polygon points in normalized local box coordinates (0..1). */
  points?: Point[];
  stroke: string;
  fill?: string | null;
  strokeWidth: number;
  dashed?: boolean;
  /** Start/end for line & arrow, normalized local coords (0..1). */
  from?: Point;
  to?: Point;
}

export interface InkObject extends BaseObject {
  kind: 'ink';
  /** Strokes in normalized local box coordinates (0..1). */
  strokes: Point[][];
  color: string;
  strokeWidth: number;
  /** Ink drawn with a translucent highlighter pen. */
  highlighter?: boolean;
}

export interface StampObject extends BaseObject {
  kind: 'stamp';
  label: string;
  /** Stamp colour theme. */
  color: string;
  variant: 'standard' | 'dynamic' | 'signature';
  /** Free text used by the "dynamic" stamp (e.g. name + date). */
  detail?: string;
  dateFormat?: string;
}

export interface SignatureObject extends BaseObject {
  kind: 'signature';
  /** Reference into the asset table (PNG data URL of the drawn signature). */
  assetId?: string;
  text?: string;
  style?: TextStyle;
  /** Signature line underneath (Acrobat style). */
  rule?: boolean;
  signer?: string;
  signedAt?: number;
}

export interface ImageObject extends BaseObject {
  kind: 'image';
  /** Reference into the asset table. */
  assetId: string;
  /** Object-fit within the box. */
  fit: 'contain' | 'stretch';
}

/**
 * Binary payloads (images, signatures, attachments) live in their own table so
 * that undo snapshots stay cheap — objects only ever hold asset *references*.
 */
export interface Asset {
  id: string;
  dataUrl: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  name?: string;
}

export interface RedactObject extends BaseObject {
  kind: 'redact';
  /** Redaction boxes are filled with this colour once applied. */
  color: string;
  applied?: boolean;
  /** Optional overlay text (e.g. "REDACTED"). */
  label?: string;
}

export interface WhiteoutObject extends BaseObject {
  kind: 'whiteout';
  color: string;
}

export interface MeasureObject extends BaseObject {
  kind: 'measure';
  /** Two points of the measured segment, normalized local coords. */
  from: Point;
  to: Point;
  stroke: string;
  strokeWidth: number;
  /** Points per PDF unit (72 dpi = 1). */
  pixelsPerUnit: number;
  unitLabel: string;
  scale: number;
}

export interface LinkObject extends BaseObject {
  kind: 'link';
  url: string;
  linkType: 'url' | 'page';
  targetPage?: number;
  hint?: string;
}

export type FormFieldKind = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'button';

export interface FormFieldObject extends BaseObject {
  kind: 'formfield';
  field: FormFieldKind;
  name: string;
  value?: string;
  checked?: boolean;
  options?: string[];
  fontSize?: number;
  color?: string;
  required?: boolean;
  multiline?: boolean;
  /** Group name shared by radio buttons in the same set. */
  group?: string;
}

export type AnyObject =
  | HighlightObject
  | NoteObject
  | TextBoxObject
  | ShapeObject
  | InkObject
  | StampObject
  | SignatureObject
  | ImageObject
  | RedactObject
  | WhiteoutObject
  | MeasureObject
  | LinkObject
  | FormFieldObject;

export interface PageInfo {
  id: PageId;
  /** 0-based index in the *current working document*. */
  index: number;
  /** Rotated page size in points (as displayed). */
  width: number;
  height: number;
  /** Unrotated media box size in points. */
  mediaWidth: number;
  mediaHeight: number;
  rotation: number;
}

/** A source PDF that makes up part of the working document. */
export interface SourceDoc {
  id: string;
  name: string;
  bytes: Uint8Array;
  /** pdf.js fingerprint once parsed, used for caching. */
  fingerprint?: string;
  /** Password for protected sources, if supplied. */
  password?: string;
  pageCount: number;
  /** Whether this document was created from a blank page. */
  blank?: boolean;
  size: number;
  loadedAt: number;
}

/**
 * One entry of the working document: which source page is placed at which
 * position, plus its edits. Keeping this indirection (instead of eagerly
 * rebuilding the PDF) is what makes reordering / deleting / rotating cheap.
 */
export interface PageEntry {
  id: PageId;
  /** 0-based position in the working document (kept in sync by the store). */
  index: number;
  sourceId: string;
  /** 0-based index inside the source document. */
  sourceIndex: number;
  /** Rotation in degrees, multiples of 90, added on top of the source page. */
  rotation: number;
  /** Page-level rotation baked from the source page (pdf.js `page.rotate`). */
  baseRotation: number;
  width: number;
  height: number;
  /** Unrotated source size. */
  mediaWidth: number;
  mediaHeight: number;
  /** Page is excluded from the saved output. */
  deleted?: boolean;
  /** Redaction boxes that cover this page (tracks pending redactions). */
  redactCount?: number;
}

export type CommentStatus = 'open' | 'resolved' | 'rejected' | 'completed' | 'cancelled' | 'none';

export interface CommentThread {
  id: string;
  objectId: ObjectId;
  pageId: PageId;
  author: string;
  messages: { id: string; author: string; body: string; at: number }[];
  status: CommentStatus;
  at: number;
}

export interface Bookmark {
  id: string;
  pageIndex: number;
  title: string;
  createdAt: number;
}

export interface HistoryEntry {
  label: string;
  at: number;
}

export interface DocumentMeta {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
}

export interface SecuritySettings {
  enabled: boolean;
  userPassword: string;
  ownerPassword: string;
  algorithm: 'AES-256' | 'AES-128' | 'RC4-128' | 'RC4-40';
  allowPrinting: 'all' | 'lowResolution' | 'none';
  allowCopying: boolean;
  allowModifying: boolean;
  allowAnnotating: boolean;
  allowForms: boolean;
  allowAccessibility: boolean;
  allowAssembly: boolean;
}

export interface CropSettings {
  pageId: PageId;
  /** Crop box in PDF space, unrotated. */
  rect: Rect;
  /** Ask to crop all pages instead of just one. */
  allPages?: boolean;
}

export type ExportFormat =
  | 'pdf'
  | 'pdf-a'
  | 'pdf-flat'
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'txt'
  | 'docx'
  | 'pptx'
  | 'xlsx'
  | 'csv'
  | 'svg'
  | 'html'
  | 'json'
  | 'md'
  | 'svg-flat';

export interface ExportOptions {
  format: ExportFormat;
  quality: number;
  scale: number;
  pages: 'all' | 'current' | 'custom';
  customPages: string;
  pdfA?: boolean;
  embedFonts?: boolean;
  ocr?: boolean;
  flatten?: boolean;
}

/** A pending in-place content edit of text that already exists in the PDF. */
export interface TextEditOp {
  id: string;
  pageId: PageId;
  /** Text of the original run, used to locate the matching show operator. */
  original: string;
  /** Replacement text. */
  text: string;
  /** PDF-space area occupied by the run (from the viewer's text layer). */
  rect: Rect;
  /**
   * Baseline origin of the run in PDF space. Used as the primary (encoding
   * independent) match key when rewriting the content stream.
   */
  origin?: { x: number; y: number };
  fontSize: number;
  fontName: string;
  color: string;
}

export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  fontSize: number;
  color: string;
  opacity: number;
  rotation: number;
  tile: boolean;
  /** Pages the watermark applies to ('all' or 0-based indices). */
  pages: 'all' | number[];
  bold?: boolean;
  italic?: boolean;
  fontFamily?: string;
}

export type PresetPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface HeaderFooterSettings {
  enabled: boolean;
  /** Templates support {page}, {pages}, {date}, {title}, {filename}, {bates}. */
  header: { left: string; center: string; right: string };
  footer: { left: string; center: string; right: string };
  fontSize: number;
  color: string;
  margin: number;
  firstPageDifferent: boolean;
  fontFamily?: string;
}

export interface PageNumberSettings {
  enabled: boolean;
  position: PresetPosition;
  format: string;
  startAt: number;
  fontSize: number;
  color: string;
  margin: number;
  /** Prefix/suffix, e.g. "Page " / " of {pages}". */
  prefix: string;
  suffix: string;
}

export interface BatesSettings {
  enabled: boolean;
  prefix: string;
  suffix: string;
  startAt: number;
  digits: number;
  position: PresetPosition;
  fontSize: number;
  color: string;
  margin: number;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
  description?: string;
  size: number;
}

export interface OcrWord {
  text: string;
  /** PDF-space rect where the word was recognised. */
  rect: Rect;
}

export interface OcrPageResult {
  pageId: PageId;
  words: OcrWord[];
  text: string;
  confidence: number;
}

export interface SearchMatch {
  pageIndex: number;
  pageId: PageId;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** Index of the text item the match came from (for the results list). */
  itemIndex?: number;
  /** Short excerpt around the match. */
  snippet?: string;
  /** Quads in PDF space for highlighting the hit. */
  quads: Quad[];
}

export interface TextItem {
  str: string;
  /** PDF-space quad of the text run. */
  quads: Quad[];
  /** Baseline origin of the run in PDF space (used for in-place text edits). */
  origin?: { x: number; y: number };
  fontSize: number;
  fontName: string;
  dir: 'ltr' | 'rtl';
  /** Transform matrix of the run in PDF space. */
  transform: Matrix;
}

export type PdfPageProxy = import('pdfjs-dist').PDFPageProxy;

export interface SourcePageData {
  items: TextItem[];
  text: string;
  /** Height/width of the unrotated, un-cropped page. */
  width: number;
  height: number;
  rotation: number;
}
