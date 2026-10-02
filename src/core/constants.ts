/** Shared constants: tools, palettes, font list, page sizes, units. */

export const APP_NAME = 'PDFmaster';
export const APP_VERSION = '1.0.0';
export const DOC_EXT = '.pdf';

export const PAGE_SIZES: Record<string, { label: string; w: number; h: number }> = {
  a4: { label: 'A4 (210 × 297 mm)', w: 595.28, h: 841.89 },
  a3: { label: 'A3 (297 × 420 mm)', w: 841.89, h: 1190.55 },
  a5: { label: 'A5 (148 × 210 mm)', w: 419.53, h: 595.28 },
  letter: { label: 'Letter (8.5 × 11 in)', w: 612, h: 792 },
  legal: { label: 'Legal (8.5 × 14 in)', w: 612, h: 1008 },
  tabloid: { label: 'Tabloid (11 × 17 in)', w: 792, h: 1224 },
  custom: { label: 'Custom size…', w: 595.28, h: 841.89 },
};

export const UNIT_TO_POINTS: Record<string, number> = {
  pt: 1,
  in: 72,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  px: 0.75,
};

export type UnitId = keyof typeof UNIT_TO_POINTS;

export const COLOR_PALETTE = [
  '#000000',
  '#404040',
  '#808080',
  '#c0c0c0',
  '#ffffff',
  '#d92c1f',
  '#ff4a3d',
  '#ff8a3d',
  '#f5a623',
  '#ffd400',
  '#a3d900',
  '#4caf50',
  '#00a884',
  '#00b8d4',
  '#2f89ff',
  '#3f51b5',
  '#7c4dff',
  '#c724b1',
  '#ff5c8a',
  '#8d6e63',
];

export const HIGHLIGHT_COLORS = [
  '#ffd400',
  '#a3e635',
  '#5eead4',
  '#7dd3fc',
  '#a5b4fc',
  '#f9a8d4',
  '#ff9f68',
  '#ff5c5c',
];

/** Fonts available for new text — all metrics-compatible with the standard 14. */
export const TEXT_FONTS = [
  { id: 'Helvetica', label: 'Helvetica', css: 'Helvetica, Arial, sans-serif' },
  { id: 'Helvetica-Bold', label: 'Helvetica Bold', css: 'Helvetica, Arial, sans-serif', bold: true },
  { id: 'Helvetica-Oblique', label: 'Helvetica Oblique', css: 'Helvetica, Arial, sans-serif', italic: true },
  { id: 'Times-Roman', label: 'Times Roman', css: '"Times New Roman", Times, serif' },
  { id: 'Times-Bold', label: 'Times Bold', css: '"Times New Roman", Times, serif', bold: true },
  { id: 'Times-Italic', label: 'Times Italic', css: '"Times New Roman", Times, serif', italic: true },
  { id: 'Courier', label: 'Courier', css: 'Courier, monospace' },
  { id: 'Courier-Bold', label: 'Courier Bold', css: 'Courier, monospace', bold: true },
];

export const BODY_FONT_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72];

export interface ToolDef {
  id: ToolId;
  label: string;
  shortcut?: string;
  group: 'edit' | 'annotate' | 'pages' | 'forms' | 'protect';
  icon: string;
  description: string;
}

export type ToolId =
  | 'select'
  | 'hand'
  | 'text'
  | 'editText'
  | 'image'
  | 'shape'
  | 'draw'
  | 'highlight'
  | 'underline'
  | 'strike'
  | 'squiggly'
  | 'note'
  | 'stamp'
  | 'signature'
  | 'link'
  | 'measure'
  | 'redact'
  | 'eraser'
  | 'form-text'
  | 'form-checkbox'
  | 'form-radio'
  | 'form-dropdown'
  | 'form-button';

export const TOOL_DEFS: Record<string, ToolDef> = {
  select: { id: 'select', label: 'Select', shortcut: 'V', group: 'edit', icon: 'MousePointer2', description: 'Select and move objects' },
  hand: { id: 'hand', label: 'Pan', shortcut: 'H', group: 'edit', icon: 'Hand', description: 'Pan the page' },
  text: { id: 'text', label: 'Add text', shortcut: 'T', group: 'edit', icon: 'Type', description: 'Add a text box' },
  editText: { id: 'editText', label: 'Edit text', shortcut: 'E', group: 'edit', icon: 'TextCursorInput', description: 'Edit text inside the PDF' },
  image: { id: 'image', label: 'Add image', shortcut: 'I', group: 'edit', icon: 'ImagePlus', description: 'Place an image on the page' },
  shape: { id: 'shape', label: 'Shapes', shortcut: 'R', group: 'edit', icon: 'Shapes', description: 'Draw rectangles, ellipses, arrows…' },
  draw: { id: 'draw', label: 'Draw', shortcut: 'D', group: 'annotate', icon: 'Pen', description: 'Freehand drawing' },
  highlight: { id: 'highlight', label: 'Highlight', shortcut: 'U', group: 'annotate', icon: 'Highlighter', description: 'Highlight text' },
  underline: { id: 'underline', label: 'Underline', group: 'annotate', icon: 'Underline', description: 'Underline text' },
  strike: { id: 'strike', label: 'Strikethrough', group: 'annotate', icon: 'Strikethrough', description: 'Strike through text' },
  squiggly: { id: 'squiggly', label: 'Squiggly', group: 'annotate', icon: 'Waves', description: 'Wavy underline' },
  note: { id: 'note', label: 'Sticky note', shortcut: 'N', group: 'annotate', icon: 'StickyNote', description: 'Add a comment note' },
  stamp: { id: 'stamp', label: 'Stamp', shortcut: 'S', group: 'annotate', icon: 'Stamp', description: 'Apply a stamp' },
  signature: { id: 'signature', label: 'Sign', group: 'annotate', icon: 'PenTool', description: 'Draw or place a signature' },
  link: { id: 'link', label: 'Link', group: 'annotate', icon: 'Link2', description: 'Add a clickable link' },
  measure: { id: 'measure', label: 'Measure', group: 'annotate', icon: 'Ruler', description: 'Measure a distance' },
  redact: { id: 'redact', label: 'Redact', shortcut: 'X', group: 'protect', icon: 'Eraser', description: 'Mark content for redaction' },
  eraser: { id: 'eraser', label: 'Erase object', group: 'edit', icon: 'Trash2', description: 'Click an object to delete it' },
  'form-text': { id: 'form-text', label: 'Text field', group: 'forms', icon: 'FormInput', description: 'Add a fillable text field' },
  'form-checkbox': { id: 'form-checkbox', label: 'Checkbox', group: 'forms', icon: 'SquareCheck', description: 'Add a checkbox' },
  'form-radio': { id: 'form-radio', label: 'Radio button', group: 'forms', icon: 'CircleDot', description: 'Add a radio group' },
  'form-dropdown': { id: 'form-dropdown', label: 'Dropdown', group: 'forms', icon: 'List', description: 'Add a dropdown list' },
  'form-button': { id: 'form-button', label: 'Button', group: 'forms', icon: 'RectangleHorizontal', description: 'Add a push button' },
};

export const ANNOTATE_TOOLS: ToolId[] = [
  'highlight',
  'underline',
  'strike',
  'squiggly',
  'note',
  'draw',
  'shape',
  'stamp',
  'signature',
  'text',
  'image',
  'link',
  'measure',
];

export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

export const STAMPS: { id: string; label: string; color: string; variant: 'standard' | 'dynamic' }[] = [
  { id: 'approved', label: 'APPROVED', color: '#1a7f37', variant: 'standard' },
  { id: 'not-approved', label: 'NOT APPROVED', color: '#c1121f', variant: 'standard' },
  { id: 'draft', label: 'DRAFT', color: '#2f89ff', variant: 'standard' },
  { id: 'final', label: 'FINAL', color: '#1a7f37', variant: 'standard' },
  { id: 'confidential', label: 'CONFIDENTIAL', color: '#c1121f', variant: 'standard' },
  { id: 'for-comment', label: 'FOR COMMENT', color: '#b26a00', variant: 'standard' },
  { id: 'for-public-release', label: 'FOR PUBLIC RELEASE', color: '#1a7f37', variant: 'standard' },
  { id: 'not-for-public-release', label: 'NOT FOR PUBLIC RELEASE', color: '#c1121f', variant: 'standard' },
  { id: 'expired', label: 'EXPIRED', color: '#6b7280', variant: 'standard' },
  { id: 'reviewed', label: 'REVIEWED', color: '#2f89ff', variant: 'standard' },
  { id: 'void', label: 'VOID', color: '#6b7280', variant: 'standard' },
  { id: 'signature-needed', label: 'SIGNATURE', color: '#2f89ff', variant: 'dynamic' },
  { id: 'received', label: 'RECEIVED', color: '#1a7f37', variant: 'dynamic' },
  { id: 'date', label: 'DATE', color: '#2f89ff', variant: 'dynamic' },
];

export const DEFAULT_ANNOTATE_COLORS: Record<string, string> = {
  highlight: '#ffd400',
  underline: '#ff4a3d',
  strike: '#ff4a3d',
  squiggly: '#ff4a3d',
  draw: '#ff4a3d',
  shape: '#ff4a3d',
  text: '#000000',
  note: '#ffd400',
  measure: '#d92c1f',
  redact: '#000000',
  whiteout: '#ffffff',
  formfield: '#2f89ff',
};

export const RENDER_SCALE_LIMIT = 8;
export const MAX_CANVAS_PIXELS = 16_777_216; // 4096² — safe on most GPUs

export const STORAGE_KEY = 'pdfmaster.session.v1';
export const PREFS_KEY = 'pdfmaster.prefs.v1';
