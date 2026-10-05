/**
 * Persistence must degrade gracefully: whichever environment the app runs in
 * (private window, hardened browser, CI), a missing IndexedDB may never break
 * opening or saving a document.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { clearRecents, listRecents, loadPreferences, loadSession, savePreferences, saveSession, addRecent } from '../storage';
import type { SavedSession } from '../storage';

const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

function removeIndexedDB(): void {
  Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });
}

function restoreIndexedDB(): void {
  if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor);
  else delete (globalThis as { indexedDB?: unknown }).indexedDB;
}

const session: SavedSession = {
  version: 1,
  savedAt: Date.now(),
  docName: 'Fallback test',
  sources: [],
  pages: [],
  objects: [],
  assets: [],
  comments: [],
  bookmarks: [],
  meta: { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' },
  security: {
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
  },
  crops: {},
  textEdits: [],
  ocr: {},
  watermark: {
    enabled: false,
    text: '',
    fontSize: 12,
    color: '#000000',
    opacity: 0.2,
    rotation: 0,
    tile: false,
    pages: 'all',
  },
  headerFooter: {
    enabled: false,
    header: { left: '', center: '', right: '' },
    footer: { left: '', center: '', right: '' },
    fontSize: 9,
    color: '#000000',
    margin: 32,
    firstPageDifferent: false,
  },
  pageNumbers: {
    enabled: false,
    position: 'bottom-center',
    format: '',
    startAt: 1,
    fontSize: 9,
    color: '#000000',
    margin: 26,
    prefix: '',
    suffix: '',
  },
  bates: {
    enabled: false,
    prefix: '',
    suffix: '',
    startAt: 1,
    digits: 6,
    position: 'bottom-right',
    fontSize: 8,
    color: '#000000',
    margin: 26,
  },
  attachments: [],
};

afterEach(restoreIndexedDB);

describe('storage', () => {
  it('round-trips the session without IndexedDB', async () => {
    removeIndexedDB();
    await saveSession(session);
    const loaded = await loadSession();
    expect(loaded?.docName).toBe('Fallback test');
  });

  it('round-trips preferences without IndexedDB', async () => {
    removeIndexedDB();
    await savePreferences({ zoom: 1.75, fitMode: 'page' });
    const prefs = await loadPreferences();
    expect(prefs?.zoom).toBe(1.75);
    expect(prefs?.fitMode).toBe('page');
  });

  it('keeps a recent-files list without IndexedDB', async () => {
    removeIndexedDB();
    await clearRecents();
    await addRecent({ name: 'a.pdf', size: 10, pages: 1, at: 1 });
    await addRecent({ name: 'a.pdf', size: 20, pages: 2, at: 2 });
    const recents = await listRecents();
    expect(recents).toHaveLength(1);
    expect(recents[0].pages).toBe(2);
  });

  it('restores a version 2 session', async () => {
    removeIndexedDB();
    await saveSession({ ...session, version: 2, docName: 'Current session' });
    const loaded = await loadSession();
    expect(loaded?.version).toBe(2);
    expect(loaded?.docName).toBe('Current session');
  });

  it('uses IndexedDB when it is available', async () => {
    restoreIndexedDB();
    await saveSession({ ...session, docName: 'IndexedDB test' });
    const loaded = await loadSession();
    expect(loaded?.docName).toBe('IndexedDB test');
  });
});
