/** UI-only state: tool, panels, zoom, dialogs, toasts, search, busy overlay. */
import { create } from 'zustand';
import type { AnyObject, ObjectId, SearchMatch, ShapeKind } from '../core/types';
import type { ToolId } from '../core/constants';
import { clamp } from '../core/utils';

export type LeftPanel = 'none' | 'thumbs' | 'bookmarks' | 'comments' | 'search' | 'attachments';
export type RightPanel =
  | 'none'
  | 'tools'
  | 'properties'
  | 'security'
  | 'export'
  | 'forms'
  | 'ocr'
  | 'organize'
  | 'metadata'
  | 'sign'
  | 'branding'
  | 'compress';

export type DialogId =
  | 'open'
  | 'export'
  | 'security'
  | 'sign'
  | 'digital-sign'
  | 'ocr'
  | 'watermark'
  | 'header-footer'
  | 'page-numbers'
  | 'bates'
  | 'metadata'
  | 'compress'
  | 'split'
  | 'insert-image'
  | 'insert-stamp'
  | 'save-as'
  | 'print'
  | 'about'
  | 'shortcuts'
  | 'new-document'
  | 'attachments'
  | 'javascript';

export interface ToolOptions {
  color: string;
  opacity: number;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  fill: string | null;
  fillOpacity: number;
  dashed: boolean;
  shape: ShapeKind;
  highlighter: boolean;
  stampId: string;
  measureUnit: string;
  measureScale: number;
  textAuto: boolean;
  autoSizeText: boolean;
  listPages: 'all' | 'current' | 'custom';
  customPages: string;
}

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
  action?: { label: string; run: () => void };
}

export interface BusyState {
  active: boolean;
  label: string;
  progress: number;
}

interface UIState {
  tool: ToolId;
  toolOptions: ToolOptions;
  zoom: number;
  fitMode: 'none' | 'page' | 'width';
  currentPage: number;
  scrollToPage: number | null;
  selection: ObjectId[];
  editingObject: ObjectId | null;
  leftPanel: LeftPanel;
  rightPanel: RightPanel;
  dialog: DialogId | null;
  dialogPayload: Record<string, unknown> | null;
  toasts: Toast[];
  busy: BusyState;
  openMenu: string | null;
  showAnnotations: boolean;
  showTextLayer: boolean;
  searchQuery: string;
  searchResults: SearchMatch[];
  searchCursor: number;
  searchOptions: { matchCase: boolean; wholeWord: boolean };
  spelling: boolean;
  statusMessage: string;
  collapsed: { left: boolean; right: boolean };
  /** A prepared object (signature, custom stamp) waiting for a click to be placed. */
  previewStamp: AnyObject | null;

  setTool: (tool: ToolId) => void;
  setToolOption: <K extends keyof ToolOptions>(key: K, value: ToolOptions[K]) => void;
  setToolOptions: (patch: Partial<ToolOptions>) => void;
  setZoom: (zoom: number, fitMode?: 'none' | 'page' | 'width') => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setCurrentPage: (page: number) => void;
  goToPage: (page: number) => void;
  setSelection: (ids: ObjectId[]) => void;
  toggleSelection: (id: ObjectId) => void;
  clearSelection: () => void;
  setEditingObject: (id: ObjectId | null) => void;
  setLeftPanel: (panel: LeftPanel) => void;
  setRightPanel: (panel: RightPanel) => void;
  openDialog: (dialog: DialogId, payload?: Record<string, unknown> | null) => void;
  closeDialog: () => void;
  toast: (kind: Toast['kind'], message: string, action?: Toast['action']) => void;
  dismissToast: (id: string) => void;
  setBusy: (busy: Partial<BusyState>) => void;
  setOpenMenu: (menu: string | null) => void;
  toggleAnnotations: () => void;
  toggleTextLayer: () => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchMatch[]) => void;
  setSearchCursor: (cursor: number) => void;
  setSearchOptions: (options: Partial<UIState['searchOptions']>) => void;
  setStatusMessage: (message: string) => void;
  toggleCollapsed: (side: 'left' | 'right') => void;
  setPreviewStamp: (stamp: AnyObject | null) => void;
}

const defaultOptions = (): ToolOptions => ({
  color: '#ff4a3d',
  opacity: 1,
  strokeWidth: 2,
  fontSize: 12,
  fontFamily: 'Helvetica',
  bold: false,
  italic: false,
  align: 'left',
  fill: null,
  fillOpacity: 0.25,
  dashed: false,
  shape: 'rect',
  highlighter: false,
  stampId: 'approved',
  measureUnit: 'mm',
  measureScale: 1,
  textAuto: true,
  autoSizeText: false,
  listPages: 'all',
  customPages: '',
});

let toastCounter = 0;

export const useUI = create<UIState>((set, get) => ({
  tool: 'select',
  toolOptions: defaultOptions(),
  zoom: 1,
  fitMode: 'width',
  currentPage: 0,
  scrollToPage: null,
  selection: [],
  editingObject: null,
  leftPanel: 'thumbs',
  rightPanel: 'tools',
  dialog: null,
  dialogPayload: null,
  toasts: [],
  busy: { active: false, label: '', progress: 0 },
  openMenu: null,
  showAnnotations: true,
  showTextLayer: true,
  searchQuery: '',
  searchResults: [],
  searchCursor: 0,
  searchOptions: { matchCase: false, wholeWord: false },
  spelling: false,
  statusMessage: '',
  collapsed: { left: false, right: false },
  previewStamp: null,

  setTool: (tool) =>
    set((state) => ({
      tool,
      selection: tool === 'select' ? state.selection : [],
      statusMessage: '',
    })),
  setToolOption: (key, value) => set((state) => ({ toolOptions: { ...state.toolOptions, [key]: value } })),
  setToolOptions: (patch) => set((state) => ({ toolOptions: { ...state.toolOptions, ...patch } })),
  setZoom: (zoom, fitMode = 'none') => set({ zoom: clamp(zoom, 0.1, 8), fitMode }),
  zoomIn: () => {
    const { zoom } = get();
    const steps = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
    const next = steps.find((s) => s > zoom + 0.001) ?? 8;
    set({ zoom: next, fitMode: 'none' });
  },
  zoomOut: () => {
    const { zoom } = get();
    const steps = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
    const next = [...steps].reverse().find((s) => s < zoom - 0.001) ?? 0.25;
    set({ zoom: next, fitMode: 'none' });
  },
  setCurrentPage: (page) => set({ currentPage: Math.max(0, page) }),
  goToPage: (page) => set({ currentPage: Math.max(0, page), scrollToPage: Math.max(0, page) }),
  setSelection: (ids) => set({ selection: ids }),
  toggleSelection: (id) =>
    set((state) => ({
      selection: state.selection.includes(id) ? state.selection.filter((s) => s !== id) : [...state.selection, id],
    })),
  clearSelection: () => set({ selection: [], editingObject: null }),
  setEditingObject: (id) => set({ editingObject: id }),
  setLeftPanel: (panel) => set((state) => ({ leftPanel: state.leftPanel === panel ? 'none' : panel })),
  setRightPanel: (panel) => set((state) => ({ rightPanel: state.rightPanel === panel ? 'none' : panel })),
  openDialog: (dialog, payload = null) => set({ dialog, dialogPayload: payload, openMenu: null }),
  closeDialog: () => set({ dialog: null, dialogPayload: null }),
  toast: (kind, message, action) => {
    toastCounter += 1;
    const id = `toast-${toastCounter}`;
    set((state) => ({ toasts: [...state.toasts, { id, kind, message, action }].slice(-4) }));
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 9000 : 5200);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  setBusy: (busy) => set((state) => ({ busy: { ...state.busy, ...busy } })),
  setOpenMenu: (menu) => set({ openMenu: menu }),
  toggleAnnotations: () => set((state) => ({ showAnnotations: !state.showAnnotations })),
  toggleTextLayer: () => set((state) => ({ showTextLayer: !state.showTextLayer })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results, searchCursor: 0 }),
  setSearchCursor: (cursor) => set({ searchCursor: cursor }),
  setSearchOptions: (options) => set((state) => ({ searchOptions: { ...state.searchOptions, ...options } })),
  setStatusMessage: (message) => set({ statusMessage: message }),
  toggleCollapsed: (side) => set((state) => ({ collapsed: { ...state.collapsed, [side]: !state.collapsed[side] } })),
  setPreviewStamp: (stamp) => set({ previewStamp: stamp }),
}));

/** Human readable hint shown in the status bar for the active tool. */
export const TOOL_HINTS: Partial<Record<ToolId, string>> = {
  select: 'Click to select, drag to move, arrow keys to nudge, Delete to remove.',
  hand: 'Drag to pan the page.',
  text: 'Click on the page to place a text box, then type.',
  editText: 'Click existing text to rewrite it. Font and position are kept.',
  image: 'Click to place the image, or drop an image file on the page.',
  shape: 'Drag to draw. Hold Shift for a square/circle.',
  draw: 'Draw with the mouse; freehand strokes are smoothed on save.',
  highlight: 'Drag across text to highlight it.',
  underline: 'Drag across text to underline it.',
  strike: 'Drag across text to strike it through.',
  squiggly: 'Drag across text for a wavy underline.',
  note: 'Click to drop a sticky note, type, then close.',
  stamp: 'Click to place the selected stamp.',
  signature: 'Click to place your signature.',
  link: 'Drag over an area to make it a clickable link.',
  measure: 'Drag to measure a distance.',
  redact: 'Drag over content to mark it for redaction, then apply.',
  eraser: 'Click an object to delete it.',
  'form-text': 'Drag to place a fillable text field.',
  'form-checkbox': 'Click to place a checkbox.',
  'form-radio': 'Click to place a radio button.',
  'form-dropdown': 'Drag to place a dropdown list.',
  'form-button': 'Drag to place a push button.',
};
