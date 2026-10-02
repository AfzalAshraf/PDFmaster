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

export interface SavedSession {
  version: 1;
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
  await set(PREFS_KEY, prefs);
}

export async function loadPreferences(): Promise<Preferences | undefined> {
  return get<Preferences>(PREFS_KEY);
}

export async function saveSession(session: SavedSession): Promise<void> {
  await set(SESSION_KEY, session);
}

export async function loadSession(): Promise<SavedSession | undefined> {
  const session = await get<SavedSession>(SESSION_KEY);
  if (!session || session.version !== 1) return undefined;
  return session;
}

export async function clearSession(): Promise<void> {
  await del(SESSION_KEY);
}

export async function addRecent(entry: RecentFile): Promise<void> {
  const list = (await get<RecentFile[]>(RECENTS_KEY)) ?? [];
  const next = [entry, ...list.filter((r) => r.name !== entry.name)].slice(0, 12);
  await set(RECENTS_KEY, next);
}

export async function listRecents(): Promise<RecentFile[]> {
  return (await get<RecentFile[]>(RECENTS_KEY)) ?? [];
}

export async function clearRecents(): Promise<void> {
  await del(RECENTS_KEY);
}
