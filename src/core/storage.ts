/**
 * Local persistence: the whole editing session is written to IndexedDB so a
 * refresh (or a crash) never loses work. Nothing is ever sent to a server.
 */
import { del, get, set } from 'idb-keyval';
import type {
  Asset,
  Attachment,
  BatesSettings,
  Bookmark,
  CommentThread,
  DocumentMeta,
  HeaderFooterSettings,
  OcrPageResult,
  PageEntry,
  PageNumberSettings,
  Rect,
  SecuritySettings,
  SourceDoc,
  TextEditOp,
  WatermarkSettings,
  AnyObject,
} from './types';

const SESSION_KEY = 'pdfmaster.session.v1';
const RECENTS_KEY = 'pdfmaster.recents.v1';

/**
 * IndexedDB is not available everywhere (private windows, hardened browsers,
 * test environments). Everything falls back to an in-memory store so the app
 * keeps working — persistence is a convenience, never a requirement.
 */
const memory = new Map<string, unknown>();
let idbUnavailable = false;

async function readKey<T>(key: string): Promise<T | undefined> {
  if (idbUnavailable) return memory.get(key) as T | undefined;
  try {
    const value = await get<T>(key);
    if (value === undefined) return memory.get(key) as T | undefined;
    return value;
  } catch {
    idbUnavailable = true;
    return memory.get(key) as T | undefined;
  }
}

async function writeKey<T>(key: string, value: T): Promise<void> {
  memory.set(key, value);
  if (idbUnavailable) return;
  try {
    await set(key, value);
  } catch {
    idbUnavailable = true;
  }
}

async function deleteKey(key: string): Promise<void> {
  memory.delete(key);
  if (idbUnavailable) return;
  try {
    await del(key);
  } catch {
    idbUnavailable = true;
  }
}

export interface SavedSession {
  /** 1 = rotation field included source /Rotate. 2 = rotation is user-only. */
  version: 1 | 2;
  savedAt: number;
  docName: string;
  sources: SourceDoc[];
  pages: PageEntry[];
  objects: AnyObject[];
  assets: Asset[];
  comments: CommentThread[];
  bookmarks: Bookmark[];
  meta: DocumentMeta;
  security: SecuritySettings;
  crops: Record<string, Rect>;
  textEdits: TextEditOp[];
  ocr: Record<string, OcrPageResult>;
  watermark: WatermarkSettings;
  headerFooter: HeaderFooterSettings;
  pageNumbers: PageNumberSettings;
  bates: BatesSettings;
  attachments: Attachment[];
}

export interface RecentFile {
  name: string;
  size: number;
  pages: number;
  at: number;
}

export type RecentEntry = RecentFile;

/** Small UI preferences (panel layout, zoom, overlays). */
export interface Preferences {
  zoom?: number;
  fitMode?: 'none' | 'page' | 'width';
  leftPanel?: string;
  rightPanel?: string;
  collapsed?: { left: boolean; right: boolean };
  showAnnotations?: boolean;
  showTextLayer?: boolean;
}

const PREFS_KEY = 'pdfmaster.prefs.v1';

export async function savePreferences(prefs: Preferences): Promise<void> {
  await writeKey(PREFS_KEY, prefs);
}

export async function loadPreferences(): Promise<Preferences | undefined> {
  return readKey<Preferences>(PREFS_KEY);
}

export async function saveSession(session: SavedSession): Promise<void> {
  await writeKey(SESSION_KEY, session);
}

export async function loadSession(): Promise<SavedSession | undefined> {
  const session = await readKey<SavedSession>(SESSION_KEY);
  if (!session?.pages) return undefined;
  const version = session.version ?? 1;
  if (version !== 1 && version !== 2) return undefined;
  return { ...session, version };
}

export async function clearSession(): Promise<void> {
  await deleteKey(SESSION_KEY);
}

export async function addRecent(entry: RecentFile): Promise<void> {
  const list = (await readKey<RecentFile[]>(RECENTS_KEY)) ?? [];
  const next = [entry, ...list.filter((r) => r.name !== entry.name)].slice(0, 12);
  await writeKey(RECENTS_KEY, next);
}

export async function listRecents(): Promise<RecentFile[]> {
  return (await readKey<RecentFile[]>(RECENTS_KEY)) ?? [];
}

export async function clearRecents(): Promise<void> {
  await deleteKey(RECENTS_KEY);
}
