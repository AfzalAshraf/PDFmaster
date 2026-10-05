/**
 * The document session store: pages, objects, comments, metadata, security and
 * undo/redo. UI-only state lives in `ui.ts` so that opening a panel never
 * pollutes the undo stack.
 */
import { create } from 'zustand';
import type {
  AnyObject,
  Asset,
  Attachment,
  BatesSettings,
  Bookmark,
  CommentThread,
  DocumentMeta,
  HeaderFooterSettings,
  ObjectId,
  OcrPageResult,
  OcrReplacement,
  PageEntry,
  PageId,
  PageNumberSettings,
  Rect,
  SecuritySettings,
  SourceDoc,
  TextEditOp,
  WatermarkSettings,
} from '../core/types';
import { blankSource } from '../core/importers';
import { clamp, uid } from '../core/utils';
import { forgetSource } from '../core/registry';
import { normalizePdfBytes } from '../core/pdfbytes';
import { addRecent, clearSession, loadSession as loadStoredSession, saveSession, type SavedSession } from '../core/storage';

export const defaultMeta = (): DocumentMeta => ({
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: 'PDFmaster',
  producer: 'PDFmaster 1.0',
});

export const defaultSecurity = (): SecuritySettings => ({
  enabled: false,
  userPassword: '',
  ownerPassword: '',
  algorithm: 'AES-256',
  allowPrinting: 'all',
  allowCopying: true,
  allowModifying: true,
  allowAnnotating: true,
  allowForms: true,
  allowAccessibility: true,
  allowAssembly: true,
});

export const defaultWatermark = (): WatermarkSettings => ({
  enabled: false,
  text: 'CONFIDENTIAL',
  fontSize: 54,
  color: '#ff4a3d',
  opacity: 0.22,
  rotation: 42,
  tile: false,
  pages: 'all',
  bold: true,
  italic: false,
  fontFamily: 'Helvetica',
});

export const defaultHeaderFooter = (): HeaderFooterSettings => ({
  enabled: false,
  header: { left: '', center: '', right: '' },
  footer: { left: '', center: '', right: '' },
  fontSize: 9,
  color: '#666666',
  margin: 32,
  firstPageDifferent: false,
  fontFamily: 'Helvetica',
});

export const defaultPageNumbers = (): PageNumberSettings => ({
  enabled: false,
  position: 'bottom-center',
  format: '',
  startAt: 1,
  fontSize: 9,
  color: '#444444',
  margin: 26,
  prefix: '',
  suffix: ' / {pages}',
});

export const defaultBates = (): BatesSettings => ({
  enabled: false,
  prefix: 'BATES-',
  suffix: '',
  startAt: 1,
  digits: 6,
  position: 'bottom-right',
  fontSize: 8,
  color: '#333333',
  margin: 26,
});

interface Snapshot {
  label: string;
  at: number;
  pages: PageEntry[];
  objects: Record<ObjectId, AnyObject>;
  objectsByPage: Record<PageId, ObjectId[]>;
  assets: Record<string, Asset>;
  comments: CommentThread[];
  bookmarks: Bookmark[];
  meta: DocumentMeta;
  crops: Record<PageId, Rect>;
  textEdits: TextEditOp[];
  ocr: Record<PageId, OcrPageResult>;
  watermark: WatermarkSettings;
  headerFooter: HeaderFooterSettings;
  pageNumbers: PageNumberSettings;
  bates: BatesSettings;
  security: SecuritySettings;
  attachments: Attachment[];
}

export interface DocState {
  sources: Record<string, SourceDoc>;
  pages: PageEntry[];
  objects: Record<ObjectId, AnyObject>;
  objectsByPage: Record<PageId, ObjectId[]>;
  assets: Record<string, Asset>;
  comments: CommentThread[];
  bookmarks: Bookmark[];
  meta: DocumentMeta;
  security: SecuritySettings;
  crops: Record<PageId, Rect>;
  textEdits: TextEditOp[];
  ocr: Record<PageId, OcrPageResult>;
  watermark: WatermarkSettings;
  headerFooter: HeaderFooterSettings;
  pageNumbers: PageNumberSettings;
  bates: BatesSettings;
  attachments: Attachment[];
  docName: string;
  dirty: boolean;
  lastSavedAt?: number;
  past: Snapshot[];
  future: Snapshot[];
  lastAction?: string;

  /* documents */
  addSources: (sources: SourceDoc[], options?: { at?: number; selectFirst?: boolean }) => number;
  addBlankPage: (size?: [number, number], at?: number) => Promise<void>;
  removeSource: (sourceId: string) => void;
  setDocName: (name: string) => void;

  /* pages */
  deletePages: (ids: PageId[]) => void;
  restorePages: (ids: PageId[]) => void;
  duplicatePages: (ids: PageId[]) => void;
  rotatePages: (ids: PageId[], delta: number) => void;
  movePage: (from: number, to: number) => void;
  movePages: (ids: PageId[], toIndex: number) => void;
  setPageRotation: (id: PageId, rotation: number) => void;
  reversePages: () => void;
  setCrop: (id: PageId, rect: Rect | null) => void;
  setCrops: (ids: PageId[], rect: Rect | null) => void;
  syncPageDims: (id: PageId, dims: { mediaWidth: number; mediaHeight: number; baseRotation: number }) => void;

  /* objects */
  addObject: (object: AnyObject, options?: { history?: boolean }) => void;
  addObjects: (objects: AnyObject[]) => void;
  updateObject: (id: ObjectId, patch: Partial<AnyObject>, options?: { history?: boolean }) => void;
  updateObjects: (patches: Array<{ id: ObjectId; patch: Partial<AnyObject> }>, options?: { history?: boolean }) => void;
  removeObjects: (ids: ObjectId[]) => void;
  reorderObject: (id: ObjectId, direction: 'front' | 'back' | 'forward' | 'backward') => void;
  clearPageObjects: (pageId: PageId) => void;

  /* content edits */
  addTextEdit: (edit: TextEditOp) => void;
  updateTextEdit: (id: string, text: string) => void;
  removeTextEdit: (id: string) => void;

  /* assets */
  addAsset: (asset: Asset) => void;

  /* comments */
  addComment: (comment: CommentThread) => void;
  addCommentMessage: (threadId: string, body: string, author?: string) => void;
  setCommentStatus: (threadId: string, status: CommentThread['status']) => void;
  removeComment: (threadId: string) => void;

  /* bookmarks */
  addBookmark: (bookmark: Bookmark) => void;
  addBookmarks: (bookmarks: Bookmark[]) => void;
  updateBookmark: (id: string, patch: Partial<Bookmark>) => void;
  removeBookmark: (id: string) => void;
  /** Creates or updates the comment thread attached to a sticky note. */
  syncNoteComment: (objectId: string, pageId: PageId, body: string, author?: string) => void;

  /* settings */
  setMeta: (patch: Partial<DocumentMeta>) => void;
  setSecurity: (patch: Partial<SecuritySettings>) => void;
  setWatermark: (patch: Partial<WatermarkSettings>) => void;
  setHeaderFooter: (patch: Partial<HeaderFooterSettings>) => void;
  setPageNumbers: (patch: Partial<PageNumberSettings>) => void;
  setBates: (patch: Partial<BatesSettings>) => void;
  addAttachment: (attachment: Attachment) => void;
  removeAttachment: (id: string) => void;
  setOcr: (pageId: PageId, result: OcrPageResult) => void;
  clearOcr: () => void;
  addOcrReplacement: (pageId: PageId, replacement: OcrReplacement) => void;
  updateOcrReplacement: (pageId: PageId, id: string, patch: { text?: string; bg?: string }) => void;
  removeOcrReplacement: (pageId: PageId, id: string) => void;

  /* history & persistence */
  pushHistory: (label: string) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  loadSession: (session: SavedSession) => void;
  /** Re-opens the autosaved session when its name matches a recent entry. */
  restoreRecent: (name: string) => Promise<boolean>;
  reset: () => void;
  toSession: () => SavedSession;
}

const HISTORY_LIMIT = 80;

/** User rotation plus the source page's own /Rotate, normalised to 0/90/180/270. */
export function displayedRotation(page: Pick<PageEntry, 'baseRotation' | 'rotation'>): number {
  return (((page.baseRotation + page.rotation) % 360) + 360) % 360;
}

/**
 * Re-derives page display sizes and keeps indices contiguous.
 * `rotation` stays the *user* rotation. Folding `baseRotation` into it (the
 * previous behaviour) made every later rotate and the exporter add the source
 * rotation a second time, so scanned/phone PDFs exported sideways.
 */
export function normalizePages(pages: PageEntry[]): PageEntry[] {
  return pages.map((page, index) => {
    const rotation = ((page.rotation % 360) + 360) % 360;
    const swapped = displayedRotation({ ...page, rotation }) % 180 !== 0;
    return {
      ...page,
      index,
      rotation,
      width: swapped ? page.mediaHeight : page.mediaWidth,
      height: swapped ? page.mediaWidth : page.mediaHeight,
    };
  });
}

/**
 * Sessions saved before the rotation fix stored `baseRotation + userRotation`
 * in `rotation`. Subtract the source rotation once so those files keep the
 * orientation the user was looking at, and new saves (version >= 2) are left
 * alone.
 */
export function migrateStoredPages(pages: PageEntry[], version: number): PageEntry[] {
  if (version >= 2) return pages;
  return pages.map((page) => ({
    ...page,
    rotation: (((page.rotation - (page.baseRotation || 0)) % 360) + 360) % 360,
  }));
}

/** Store index at which a page inserted at this visual position should land. */
export function storeIndexFromVisual(pages: PageEntry[], visualIndex: number): number {
  let seen = 0;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].deleted) continue;
    if (seen === visualIndex) return i;
    seen += 1;
  }
  return pages.length;
}

/** Visual index of a page, ignoring soft-deleted entries. -1 when missing. */
export function visualIndexOf(pages: PageEntry[], pageId: string): number {
  return pages.filter((page) => !page.deleted).findIndex((page) => page.id === pageId);
}

function snapshot(state: DocState, label: string): Snapshot {
  return {
    label,
    at: Date.now(),
    pages: structuredClone(state.pages),
    objects: structuredClone(state.objects),
    objectsByPage: structuredClone(state.objectsByPage),
    assets: { ...state.assets },
    comments: structuredClone(state.comments),
    bookmarks: structuredClone(state.bookmarks),
    meta: { ...state.meta },
    crops: structuredClone(state.crops),
    textEdits: structuredClone(state.textEdits),
    ocr: structuredClone(state.ocr),
    watermark: { ...state.watermark },
    headerFooter: structuredClone(state.headerFooter),
    pageNumbers: { ...state.pageNumbers },
    bates: { ...state.bates },
    security: { ...state.security },
    attachments: state.attachments.map((a) => ({ ...a, bytes: a.bytes })),
  };
}

const initialState = () => ({
  sources: {} as Record<string, SourceDoc>,
  pages: [] as PageEntry[],
  objects: {} as Record<ObjectId, AnyObject>,
  objectsByPage: {} as Record<PageId, ObjectId[]>,
  assets: {} as Record<string, Asset>,
  comments: [] as CommentThread[],
  bookmarks: [] as Bookmark[],
  meta: defaultMeta(),
  security: defaultSecurity(),
  crops: {} as Record<PageId, Rect>,
  textEdits: [] as TextEditOp[],
  ocr: {} as Record<PageId, OcrPageResult>,
  watermark: defaultWatermark(),
  headerFooter: defaultHeaderFooter(),
  pageNumbers: defaultPageNumbers(),
  bates: defaultBates(),
  attachments: [] as Attachment[],
  docName: 'Untitled',
  dirty: false,
  lastSavedAt: undefined as number | undefined,
  past: [] as Snapshot[],
  future: [] as Snapshot[],
  lastAction: undefined as string | undefined,
});

export const useDoc = create<DocState>((set, get) => {
  /** Runs a mutation as one undoable step. */
  const mutate = (label: string, fn: (state: DocState) => Partial<DocState> | void) => {
    const state = get();
    const entry = snapshot(state, label);
    const patch = fn(state) ?? {};
    set({
      ...patch,
      past: [...state.past, entry].slice(-HISTORY_LIMIT),
      future: [],
      dirty: true,
      lastAction: label,
    });
  };

  return {
    ...initialState(),

    /* ----------------------------- documents ----------------------------- */
    addSources: (sources, options) => {
      const state = get();
      const at = options?.at ?? state.pages.length;
      const newPages: PageEntry[] = sources.flatMap((source) =>
        Array.from({ length: source.pageCount }, (_, index) => {
          const info = source.pageInfo?.[index];
          return {
            id: uid('page'),
            index,
            sourceId: source.id,
            sourceIndex: index,
            rotation: 0,
            baseRotation: info?.baseRotation ?? 0,
            width: 0,
            height: 0,
            mediaWidth: info?.mediaWidth ?? 0,
            mediaHeight: info?.mediaHeight ?? 0,
          };
        }),
      );
      mutate(sources.length > 1 ? `Insert ${sources.length} documents` : 'Insert document', (current) => {
        const pages = [...current.pages];
        pages.splice(at, 0, ...newPages);
        return {
          sources: { ...current.sources, ...Object.fromEntries(sources.map((s) => [s.id, s])) },
          pages: normalizePages(pages),
        };
      });
      void state;
      return newPages.length;
    },

    addBlankPage: async (size, at) => {
      const source = await blankSource(size);
      get().addSources([source], { at });
    },

    removeSource: (sourceId) => {
      mutate('Remove document', (state) => {
        const pages = state.pages.filter((p) => p.sourceId !== sourceId);
        const sources = { ...state.sources };
        delete sources[sourceId];
        const removedPages = state.pages.filter((p) => p.sourceId === sourceId).map((p) => p.id);
        const objects = { ...state.objects };
        const objectsByPage = { ...state.objectsByPage };
        for (const pageId of removedPages) {
          for (const id of objectsByPage[pageId] ?? []) delete objects[id];
          delete objectsByPage[pageId];
        }
        forgetSource(sourceId);
        return { sources, pages: normalizePages(pages), objects, objectsByPage };
      });
    },

    setDocName: (name) => set({ docName: name, dirty: true }),

    /* -------------------------------- pages ------------------------------- */
    deletePages: (ids) => {
      if (!ids.length) return;
      mutate(ids.length > 1 ? `Delete ${ids.length} pages` : 'Delete page', (state) => {
        const pages = state.pages.map((p) => (ids.includes(p.id) ? { ...p, deleted: true } : p));
        return { pages: normalizePages(pages) };
      });
    },

    restorePages: (ids) => {
      mutate('Restore pages', (state) => ({
        pages: normalizePages(state.pages.map((p) => (ids.includes(p.id) ? { ...p, deleted: false } : p))),
      }));
    },

    duplicatePages: (ids) => {
      if (!ids.length) return;
      mutate('Duplicate pages', (state) => {
        const pages = [...state.pages];
        const objects = { ...state.objects };
        const objectsByPage = { ...state.objectsByPage };
        const crops = { ...state.crops };
        const textEdits = [...state.textEdits];
        const ocr = { ...state.ocr };
        const comments = [...state.comments];
        const insertAt = Math.max(...ids.map((id) => pages.findIndex((p) => p.id === id))) + 1;
        const clones: PageEntry[] = [];
        for (const id of ids) {
          const source = pages.find((p) => p.id === id);
          if (!source) continue;
          const clone: PageEntry = { ...source, id: uid('page') };
          clones.push(clone);
          const idMap = new Map<string, string>();
          const clonedObjectIds: string[] = [];
          for (const objectId of objectsByPage[source.id] ?? []) {
            const original = objects[objectId];
            if (!original) continue;
            const copy = { ...structuredClone(original), id: uid('obj'), pageId: clone.id };
            idMap.set(original.id, copy.id);
            objects[copy.id] = copy;
            clonedObjectIds.push(copy.id);
          }
          objectsByPage[clone.id] = clonedObjectIds;
          if (crops[source.id]) crops[clone.id] = { ...crops[source.id] };
          for (const edit of state.textEdits) {
            if (edit.pageId === source.id) textEdits.push({ ...structuredClone(edit), id: uid('edit'), pageId: clone.id });
          }
          if (ocr[source.id]) ocr[clone.id] = { ...structuredClone(ocr[source.id]), pageId: clone.id };
          for (const thread of state.comments) {
            if (thread.pageId !== source.id) continue;
            const objectId = idMap.get(thread.objectId);
            if (!objectId) continue;
            comments.push({ ...structuredClone(thread), id: uid('thread'), pageId: clone.id, objectId });
          }
        }
        pages.splice(insertAt, 0, ...clones);
        return { pages: normalizePages(pages), objects, objectsByPage, crops, textEdits, ocr, comments };
      });
    },

    rotatePages: (ids, delta) => {
      mutate('Rotate pages', (state) => ({
        pages: normalizePages(
          state.pages.map((p) => (ids.includes(p.id) ? { ...p, rotation: p.rotation + delta } : p)),
        ),
      }));
    },

    movePage: (from, to) => {
      mutate('Reorder pages', (state) => {
        const pages = [...state.pages];
        const [moved] = pages.splice(from, 1);
        if (!moved) return {};
        pages.splice(clamp(to, 0, pages.length), 0, moved);
        return { pages: normalizePages(pages) };
      });
    },

    movePages: (ids, toIndex) => {
      mutate('Reorder pages', (state) => {
        const moving = state.pages.filter((p) => ids.includes(p.id));
        const rest = state.pages.filter((p) => !ids.includes(p.id));
        const anchor = state.pages[toIndex];
        const insertAt = anchor ? rest.findIndex((p) => p.id === anchor.id) : rest.length;
        rest.splice(insertAt < 0 ? rest.length : insertAt, 0, ...moving);
        return { pages: normalizePages(rest) };
      });
    },

    setPageRotation: (id, rotation) =>
      mutate('Set rotation', (state) => ({
        pages: normalizePages(state.pages.map((p) => (p.id === id ? { ...p, rotation } : p))),
      })),

    reversePages: () =>
      mutate('Reverse pages', (state) => ({ pages: normalizePages([...state.pages].reverse()) })),

    syncPageDims: (id, dims) => {
      // Geometry discovered from the PDF itself: not an undoable user action,
      // but it should still reach the autosaved session.
      set((state) => ({
        pages: normalizePages(state.pages.map((p) => (p.id === id ? { ...p, ...dims } : p))),
      }));
      scheduleAutosave();
    },

    setCrop: (id, rect) =>
      mutate(rect ? 'Crop page' : 'Reset crop', (state) => {
        const crops = { ...state.crops };
        if (rect) crops[id] = rect;
        else delete crops[id];
        return { crops };
      }),

    setCrops: (ids, rect) =>
      mutate(rect ? 'Crop pages' : 'Reset crops', (state) => {
        const crops = { ...state.crops };
        for (const id of ids) {
          if (rect) crops[id] = { ...rect };
          else delete crops[id];
        }
        return { crops };
      }),

    /* ------------------------------ objects ------------------------------- */
    addObject: (object, options) => {
      const apply = (state: DocState) => ({
        objects: { ...state.objects, [object.id]: object },
        objectsByPage: {
          ...state.objectsByPage,
          [object.pageId]: [...(state.objectsByPage[object.pageId] ?? []), object.id],
        },
      });
      if (options?.history === false) set(apply(get()));
      else mutate(`Add ${object.kind}`, apply);
    },

    addObjects: (objects) =>
      mutate(`Add ${objects.length} objects`, (state) => {
        const next = { ...state.objects };
        const byPage = { ...state.objectsByPage };
        for (const object of objects) {
          next[object.id] = object;
          byPage[object.pageId] = [...(byPage[object.pageId] ?? []), object.id];
        }
        return { objects: next, objectsByPage: byPage };
      }),

    updateObject: (id, patch, options) => {
      const apply = (state: DocState) => {
        const existing = state.objects[id];
        if (!existing) return {};
        return { objects: { ...state.objects, [id]: { ...existing, ...patch } as AnyObject } };
      };
      // Live drags skip the undo stack (the caller snapshots once) but must
      // still mark the document dirty, otherwise a move is lost on reload.
      if (options?.history === false) set({ ...apply(get()), dirty: true });
      else mutate('Edit object', apply);
    },

    updateObjects: (patches, options) => {
      const apply = (state: DocState) => {
        const objects = { ...state.objects };
        for (const { id, patch } of patches) {
          const existing = objects[id];
          if (!existing) continue;
          objects[id] = { ...existing, ...patch } as AnyObject;
        }
        return { objects };
      };
      if (options?.history === false) set({ ...apply(get()), dirty: true });
      else mutate('Edit objects', apply);
    },

    removeObjects: (ids) => {
      if (!ids.length) return;
      mutate(ids.length > 1 ? `Delete ${ids.length} objects` : 'Delete object', (state) => {
        const objects = { ...state.objects };
        const objectsByPage = { ...state.objectsByPage };
        for (const id of ids) {
          const object = objects[id];
          if (!object) continue;
          delete objects[id];
          objectsByPage[object.pageId] = (objectsByPage[object.pageId] ?? []).filter((o) => o !== id);
        }
        return { objects, objectsByPage };
      });
    },

    reorderObject: (id, direction) => {
      mutate('Reorder object', (state) => {
        const object = state.objects[id];
        if (!object) return {};
        const list = [...(state.objectsByPage[object.pageId] ?? [])];
        const index = list.indexOf(id);
        if (index < 0) return {};
        list.splice(index, 1);
        if (direction === 'front') list.push(id);
        else if (direction === 'back') list.unshift(id);
        else if (direction === 'forward') list.splice(Math.min(index + 1, list.length), 0, id);
        else list.splice(Math.max(index - 1, 0), 0, id);
        return { objectsByPage: { ...state.objectsByPage, [object.pageId]: list } };
      });
    },

    clearPageObjects: (pageId) => {
      mutate('Clear page objects', (state) => {
        const ids = state.objectsByPage[pageId] ?? [];
        const objects = { ...state.objects };
        for (const id of ids) delete objects[id];
        return { objects, objectsByPage: { ...state.objectsByPage, [pageId]: [] } };
      });
    },

    /* --------------------------- content edits ---------------------------- */
    addTextEdit: (edit) => mutate('Edit PDF text', (state) => ({ textEdits: [...state.textEdits, edit] })),
    updateTextEdit: (id, text) =>
      mutate('Edit PDF text', (state) => ({
        textEdits: state.textEdits.map((edit) => (edit.id === id ? { ...edit, text } : edit)),
      })),
    removeTextEdit: (id) => mutate('Revert text edit', (state) => ({ textEdits: state.textEdits.filter((e) => e.id !== id) })),

    /* ------------------------------- assets ------------------------------- */
    addAsset: (asset) => mutate('Add image', (state) => ({ assets: { ...state.assets, [asset.id]: asset } })),

    /* ------------------------------ comments ------------------------------ */
    addComment: (comment) => mutate('Add comment', (state) => ({ comments: [...state.comments, comment] })),
    addCommentMessage: (threadId, body, author = 'You') =>
      mutate('Reply to comment', (state) => ({
        comments: state.comments.map((thread) =>
          thread.id === threadId
            ? { ...thread, messages: [...thread.messages, { id: uid('msg'), author, body, at: Date.now() }] }
            : thread,
        ),
      })),
    setCommentStatus: (threadId, status) =>
      mutate('Update comment', (state) => ({
        comments: state.comments.map((thread) => (thread.id === threadId ? { ...thread, status } : thread)),
      })),
    removeComment: (threadId) => mutate('Delete comment', (state) => ({ comments: state.comments.filter((t) => t.id !== threadId) })),

    /* ------------------------------ bookmarks ----------------------------- */
    addBookmark: (bookmark) => mutate('Add bookmark', (state) => ({ bookmarks: [...state.bookmarks, bookmark] })),
    addBookmarks: (bookmarks) => {
      if (!bookmarks.length) return;
      mutate(bookmarks.length > 1 ? `Import ${bookmarks.length} bookmarks` : 'Add bookmark', (state) => ({
        bookmarks: [...state.bookmarks, ...bookmarks],
      }));
    },
    syncNoteComment: (objectId, pageId, body, author = 'You') =>
      mutate('Update note', (state) => {
        const existing = state.comments.find((thread) => thread.objectId === objectId);
        if (!existing) {
          if (!body.trim()) return {};
          return {
            comments: [
              ...state.comments,
              {
                id: uid('thread'),
                objectId,
                pageId,
                author,
                messages: [{ id: uid('msg'), author, body, at: Date.now() }],
                status: 'open' as const,
                at: Date.now(),
              },
            ],
          };
        }
        return {
          comments: state.comments.map((thread) =>
            thread.id === existing.id
              ? {
                  ...thread,
                  pageId,
                  messages: thread.messages.length
                    ? [{ ...thread.messages[0], body, at: Date.now() }, ...thread.messages.slice(1)]
                    : [{ id: uid('msg'), author, body, at: Date.now() }],
                }
              : thread,
          ),
        };
      }),
    updateBookmark: (id, patch) =>
      mutate('Rename bookmark', (state) => ({
        bookmarks: state.bookmarks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      })),
    removeBookmark: (id) => mutate('Delete bookmark', (state) => ({ bookmarks: state.bookmarks.filter((b) => b.id !== id) })),

    /* ------------------------------- settings ----------------------------- */
    setMeta: (patch) => mutate('Update metadata', (state) => ({ meta: { ...state.meta, ...patch } })),
    setSecurity: (patch) => mutate('Update security', (state) => ({ security: { ...state.security, ...patch } })),
    setWatermark: (patch) => mutate('Update watermark', (state) => ({ watermark: { ...state.watermark, ...patch } })),
    setHeaderFooter: (patch) => mutate('Update header/footer', (state) => ({ headerFooter: { ...state.headerFooter, ...patch } })),
    setPageNumbers: (patch) => mutate('Update page numbers', (state) => ({ pageNumbers: { ...state.pageNumbers, ...patch } })),
    setBates: (patch) => mutate('Update Bates numbering', (state) => ({ bates: { ...state.bates, ...patch } })),
    addAttachment: (attachment) => mutate('Attach file', (state) => ({ attachments: [...state.attachments, attachment] })),
    removeAttachment: (id) => mutate('Remove attachment', (state) => ({ attachments: state.attachments.filter((a) => a.id !== id) })),
    setOcr: (pageId, result) => mutate('Add OCR text layer', (state) => ({ ocr: { ...state.ocr, [pageId]: { ...result, pageId } } })),
    clearOcr: () => mutate('Remove OCR layer', () => ({ ocr: {} })),
    addOcrReplacement: (pageId, replacement) =>
      mutate('Replace OCR text', (state) => {
        const current = state.ocr[pageId];
        if (!current) return {};
        return { ocr: { ...state.ocr, [pageId]: { ...current, replacements: [...(current.replacements ?? []), replacement] } } };
      }),
    updateOcrReplacement: (pageId, id, patch) =>
      mutate('Replace OCR text', (state) => {
        const current = state.ocr[pageId];
        if (!current?.replacements?.length) return {};
        return {
          ocr: {
            ...state.ocr,
            [pageId]: {
              ...current,
              replacements: current.replacements.map((item) => (item.id === id ? { ...item, ...patch } : item)),
            },
          },
        };
      }),
    removeOcrReplacement: (pageId, id) =>
      mutate('Remove OCR replacement', (state) => {
        const current = state.ocr[pageId];
        if (!current?.replacements?.length) return {};
        return { ocr: { ...state.ocr, [pageId]: { ...current, replacements: current.replacements.filter((r) => r.id !== id) } } };
      }),

    /* ------------------------- history & persistence ---------------------- */
    pushHistory: (label) => {
      const state = get();
      set({ past: [...state.past, snapshot(state, label)].slice(-HISTORY_LIMIT), future: [] });
    },

    undo: () => {
      const state = get();
      const previous = state.past[state.past.length - 1];
      if (!previous) return;
      const current = snapshot(state, previous.label);
      set({
        ...restore(previous),
        past: state.past.slice(0, -1),
        future: [current, ...state.future].slice(0, HISTORY_LIMIT),
        dirty: true,
        lastAction: `Undo ${previous.label}`,
      });
    },

    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next) return;
      const current = snapshot(state, next.label);
      set({
        ...restore(next),
        past: [...state.past, current].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        dirty: true,
        lastAction: `Redo ${next.label}`,
      });
    },

    markSaved: () => set({ dirty: false, lastSavedAt: Date.now() }),

    loadSession: (session) => {
      clearSession().catch(() => {});
      set({
        sources: Object.fromEntries(
          session.sources.map((s) => {
            const bytes = normalizePdfBytes(s.bytes);
            return [s.id, { ...s, bytes, size: bytes.byteLength || s.size }];
          }),
        ),
        pages: normalizePages(migrateStoredPages(session.pages, session.version ?? 1)),
        objects: Object.fromEntries(session.objects.map((o) => [o.id, o])),
        objectsByPage: buildPageIndex(session.pages, session.objects),
        assets: Object.fromEntries(session.assets.map((a) => [a.id, a])),
        comments: session.comments,
        bookmarks: session.bookmarks,
        meta: { ...defaultMeta(), ...session.meta },
        security: { ...defaultSecurity(), ...session.security },
        crops: session.crops ?? {},
        textEdits: session.textEdits ?? [],
        ocr: session.ocr ?? {},
        watermark: { ...defaultWatermark(), ...session.watermark },
        headerFooter: { ...defaultHeaderFooter(), ...session.headerFooter },
        pageNumbers: { ...defaultPageNumbers(), ...session.pageNumbers },
        bates: { ...defaultBates(), ...session.bates },
        attachments: session.attachments ?? [],
        docName: session.docName,
        dirty: false,
        past: [],
        future: [],
        lastSavedAt: session.savedAt,
      });
    },

    restoreRecent: async (name) => {
      const session = await loadStoredSession();
      if (!session) return false;
      if (session.docName && name && session.docName !== name) return false;
      get().loadSession(session);
      return true;
    },

    reset: () => {
      const state = get();
      for (const id of Object.keys(state.sources)) forgetSource(id);
      clearSession().catch(() => {});
      set({ ...initialState() });
    },

    toSession: () => {
      const state = get();
      return {
        version: 2,
        savedAt: Date.now(),
        docName: state.docName,
        sources: Object.values(state.sources),
        pages: state.pages,
        objects: Object.values(state.objects),
        assets: Object.values(state.assets),
        comments: state.comments,
        bookmarks: state.bookmarks,
        meta: state.meta,
        security: state.security,
        crops: state.crops,
        textEdits: state.textEdits,
        ocr: state.ocr,
        watermark: state.watermark,
        headerFooter: state.headerFooter,
        pageNumbers: state.pageNumbers,
        bates: state.bates,
        attachments: state.attachments,
      };
    },
  };
});

function restore(snap: Snapshot): Partial<DocState> {
  return {
    pages: snap.pages,
    objects: snap.objects,
    objectsByPage: snap.objectsByPage,
    assets: snap.assets,
    comments: snap.comments,
    bookmarks: snap.bookmarks,
    meta: snap.meta,
    crops: snap.crops,
    textEdits: snap.textEdits,
    ocr: snap.ocr,
    watermark: snap.watermark,
    headerFooter: snap.headerFooter,
    pageNumbers: snap.pageNumbers,
    bates: snap.bates,
    security: snap.security,
    attachments: snap.attachments,
  };
}

function buildPageIndex(pages: PageEntry[], objects: AnyObject[]): Record<PageId, ObjectId[]> {
  const index: Record<PageId, ObjectId[]> = {};
  for (const page of pages) index[page.id] = [];
  for (const object of objects) {
    index[object.pageId] = [...(index[object.pageId] ?? []), object.id];
  }
  return index;
}

/** Debounced autosave: 1.2 s after the last change, everything goes to IndexedDB. */
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * Autosave subscription: any document change (that is not itself a save)
 * schedules a debounced write of the whole session.
 */
useDoc.subscribe((state, previous) => {
  if (state === previous) return;
  if (!state.dirty) return;
  if (state.lastSavedAt !== previous.lastSavedAt && state.pages === previous.pages) return;
  scheduleAutosave();
});

/** Sessions larger than this are not autosaved (IndexedDB writes get slow). */
const AUTOSAVE_LIMIT_BYTES = 120 * 1024 * 1024;
let autosaveWarned = false;

let autosaveGeneration = 0;

export function scheduleAutosave(): void {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  const generation = ++autosaveGeneration;
  autosaveTimer = setTimeout(() => {
    const state = useDoc.getState();
    if (!state.pages.length) return;
    const totalBytes = Object.values(state.sources).reduce((sum, source) => sum + (source.size || 0), 0);
    if (totalBytes > AUTOSAVE_LIMIT_BYTES) {
      if (!autosaveWarned) {
        autosaveWarned = true;
        console.warn('PDFmaster: this document is too large to autosave — export a copy to keep your work.');
      }
      return;
    }
    autosaveWarned = false;
    const session = state.toSession();
    saveSession(session)
      .then(() => {
        // A newer edit scheduled another save while this one was in flight.
        // Clearing dirty here would drop that edit on the next reload.
        if (generation !== autosaveGeneration) return;
        useDoc.getState().markSaved();
        addRecent({
          name: session.docName,
          size: session.sources.reduce((sum, s) => sum + s.size, 0),
          pages: session.pages.length,
          at: Date.now(),
        }).catch(() => {});
      })
      .catch(() => {});
  }, 1200);
}
