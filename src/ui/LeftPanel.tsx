import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileText,
  GripVertical,
  MessageSquare,
  Paperclip,
  RotateCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { displayedRotation, storeIndexFromVisual, useDoc, visualIndexOf } from '../state/store';
import { useUI } from '../state/ui';
import type { LeftPanel as LeftPanelId } from '../state/ui';
import { Badge, Button, EmptyState, IconButton, Input, Select, Tabs } from './primitives';
import { getDocumentProxy, getPageTextData, findInPage, renderThumbnail } from '../core/registry';
import type { SearchMatch } from '../core/types';
import { uid } from '../core/utils';

export const LeftPanel: React.FC = () => {
  const panel = useUI((s) => s.leftPanel);
  const setLeftPanel = useUI((s) => s.setLeftPanel);
  if (panel === 'none') return null;

  const tabs: { id: LeftPanelId; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
    { id: 'thumbs', label: 'Pages', icon: FileText },
    { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
    { id: 'comments', label: 'Comments', icon: MessageSquare },
    { id: 'attachments', label: 'Files', icon: Paperclip },
    { id: 'search', label: 'Search', icon: Search },
  ];

  return (
    <aside className="pm-no-print flex w-[268px] shrink-0 flex-col border-r border-ink-700 bg-ink-850" data-testid="left-panel">
      <div className="flex h-8 items-center border-b border-ink-700 pl-2 pr-1">
        <Tabs
          value={panel}
          onChange={(id) => setLeftPanel(id)}
          items={tabs.map((t) => ({ id: t.id, label: t.label }))}
          className="min-w-0 flex-1"
        />
        <IconButton icon={X} label="Close panel" onClick={() => setLeftPanel(panel)} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {panel === 'thumbs' ? <ThumbsPanel /> : null}
        {panel === 'bookmarks' ? <BookmarksPanel /> : null}
        {panel === 'comments' ? <CommentsPanel /> : null}
        {panel === 'attachments' ? <AttachmentsPanel /> : null}
        {panel === 'search' ? <SearchPanel /> : null}
      </div>
    </aside>
  );
};

/* ------------------------------------------------------------------ */
/* Thumbnails                                                          */
/* ------------------------------------------------------------------ */

const ThumbsPanel: React.FC = () => {
  const pages = useDoc((s) => s.pages);
  const sources = useDoc((s) => s.sources);
  const currentPage = useUI((s) => s.currentPage);
  const goToPage = useUI((s) => s.goToPage);
  const setSelection = useUI((s) => s.setSelection);
  const [selected, setSelected] = useState<string[]>([]);
  const [size, setSize] = useState(120);
  const active = pages.filter((p) => !p.deleted);

  const toggle = (id: string, index: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    goToPage(index);
  };

  return (
    <div className="p-2">
      <div className="mb-2 flex items-center gap-2 px-1 text-2xs text-ink-400">
        <span>Thumbnail size</span>
        <input
          type="range"
          min={90}
          max={200}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      {selected.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-1 rounded-md border border-accent/40 bg-accent/10 p-1.5">
          <Button size="sm" variant="ghost" onClick={() => useDoc.getState().deletePages(selected)}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => useDoc.getState().rotatePages(selected, 90)}>
            Rotate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => useDoc.getState().duplicatePages(selected)}>
            Duplicate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      ) : null}
      <div className="space-y-2">
        {active.map((entry, index) => {
          const source = sources[entry.sourceId];
          return (
            <div
              key={entry.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/pm-page', String(entry.index));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData('text/pm-page'));
                if (Number.isFinite(from) && from !== entry.index) useDoc.getState().movePage(from, entry.index);
              }}
              onClick={() => toggle(entry.id, index)}
              className={`group relative cursor-pointer rounded-md border p-1.5 transition-colors ${
                selected.includes(entry.id)
                  ? 'border-accent bg-accent/10'
                  : currentPage === index
                    ? 'border-ink-600 bg-ink-800'
                    : 'border-transparent hover:border-ink-600 hover:bg-ink-800/60'
              }`}
            >
              <div className="flex items-start gap-1.5">
                <span className="mt-1 shrink-0 cursor-grab text-ink-500 group-hover:text-ink-300">
                  <GripVertical size={12} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="mx-auto bg-white shadow-page"
                    style={{
                      width: size,
                      height: Math.round((size * entry.height) / Math.max(1, entry.width)),
                    }}
                  >
                    {source && entry.mediaWidth ? (
                      <Thumbnail sourceId={entry.sourceId} index={entry.sourceIndex} width={size * 2} rotation={displayedRotation(entry)} />
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-2xs text-ink-400">
                    <span className="tabular-nums">{index + 1}</span>
                    <span className="opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        title="Rotate"
                        onClick={(e) => {
                          e.stopPropagation();
                          useDoc.getState().rotatePages([entry.id], 90);
                        }}
                        className="rounded p-0.5 hover:bg-ink-700 hover:text-white"
                      >
                        <RotateCw size={11} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        title="Delete page"
                        disabled={active.length <= 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          useDoc.getState().deletePages([entry.id]);
                        }}
                        className="rounded p-0.5 hover:bg-ink-700 hover:text-red-300 disabled:opacity-30"
                      >
                        <Trash2 size={11} strokeWidth={1.75} />
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between px-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelection([]);
            void import('../ui/actions').then((m) =>
              m.insertPagesFromFiles(storeIndexFromVisual(useDoc.getState().pages, currentPage + 1)),
            );
          }}
        >
          Insert pages…
        </Button>
        <span className="text-2xs text-ink-500">{active.length} pages</span>
      </div>
    </div>
  );
};

const Thumbnail: React.FC<{ sourceId: string; index: number; width: number; rotation: number }> = ({
  sourceId,
  index,
  width,
  rotation,
}) => {
  const source = useDoc((s) => s.sources[sourceId]);
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || !source) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [source]);

  useEffect(() => {
    if (!visible || !source) return;
    let cancelled = false;
    setUrl(null);
    void renderThumbnail(source, index, width, rotation)
      .then((data) => {
        if (!cancelled) setUrl(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible, source, index, width, rotation]);

  return (
    <div ref={ref} className="h-full w-full overflow-hidden">
      {url ? (
        <img
          src={url}
          alt={`Page ${index + 1}`}
          draggable={false}
          className="h-full w-full object-contain"

        />
      ) : (
        <div className="pm-skeleton h-full w-full" />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Bookmarks                                                           */
/* ------------------------------------------------------------------ */

const BookmarksPanel: React.FC = () => {
  const bookmarks = useDoc((s) => s.bookmarks);
  const pages = useDoc((s) => s.pages).filter((p) => !p.deleted);
  const currentPage = useUI((s) => s.currentPage);
  const goToPage = useUI((s) => s.goToPage);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState(1);

  return (
    <div className="p-2">
      <div className="mb-3 space-y-2 rounded-md border border-ink-700 bg-ink-800/60 p-2">
        <Input value={title} placeholder="Bookmark title" onChange={(e) => setTitle(e.target.value)} className="h-7 text-base" />
        <div className="flex items-center gap-2">
          <Select
            className="flex-1"
            value={String(target)}
            onChange={(v) => setTarget(Number(v))}
            options={pages.map((_page, i) => ({ value: String(i + 1), label: `Page ${i + 1}` }))}
          />
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              if (!title.trim()) return;
              const page = pages[target - 1];
              useDoc.getState().addBookmark({
                id: uid('bm'),
                title: title.trim(),
                pageIndex: target - 1,
                pageId: page?.id,
                createdAt: Date.now(),
              });
              setTitle('');
              useUI.getState().toast('success', 'Bookmark added.');
            }}
          >
            Add
          </Button>
        </div>
      </div>
      {bookmarks.length === 0 ? (
        <EmptyState icon={Bookmark} title="No bookmarks" hint="Add one to jump straight to a page, or import the PDF's own outline." />
      ) : (
        <ul className="space-y-0.5">
          {bookmarks.map((bm) => (
            <li
              key={bm.id}
              className={`group flex items-center gap-1 rounded px-1.5 py-1 text-base ${
                bookmarkVisual(bm, pages) === currentPage ? 'bg-ink-700 text-white' : 'text-ink-200 hover:bg-ink-800'
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => goToPage(Math.max(0, bookmarkVisual(bm, pages)))}
              >
                {bm.title}
              </button>
              <span className="shrink-0 text-2xs text-ink-500">p{bookmarkVisual(bm, pages) + 1}</span>
              <button
                type="button"
                title="Remove"
                onClick={() => useDoc.getState().removeBookmark(bm.id)}
                className="shrink-0 rounded p-0.5 text-ink-500 opacity-0 hover:text-red-300 group-hover:opacity-100"
              >
                <X size={12} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        size="sm"
        variant="ghost"
        full
        className="mt-3"
        onClick={() => void importOutlines()}
      >
        <Download size={12} strokeWidth={1.75} /> Import PDF outline
      </Button>
    </div>
  );
};

function bookmarkVisual(bookmark: { pageId?: string; pageIndex: number }, visiblePages: { id: string }[]): number {
  if (bookmark.pageId) {
    const visual = visiblePages.findIndex((page) => page.id === bookmark.pageId);
    if (visual >= 0) return visual;
  }
  return bookmark.pageIndex;
}

async function importOutlines(): Promise<void> {
  const state = useDoc.getState();
  const sources = Object.values(state.sources);
  if (!sources.length) return;
  const collected: { title: string; pageIndex: number; pageId?: string }[] = [];
  try {
    for (const source of sources) {
      const proxy = await getDocumentProxy(source);
      const outline = await proxy.getOutline();
      if (!outline?.length) continue;
      const walk = async (items: typeof outline, level = 0): Promise<void> => {
        for (const item of items) {
          const sourceIndex = await outlinePageIndex(proxy, item.dest);
          if (sourceIndex !== null) {
            const page = state.pages.find((entry) => !entry.deleted && entry.sourceId === source.id && entry.sourceIndex === sourceIndex);
            if (page) {
              collected.push({
                title: `${'  '.repeat(level)}${item.title}`,
                pageIndex: visualIndexOf(state.pages, page.id),
                pageId: page.id,
              });
            }
          }
          if (item.items?.length) await walk(item.items, level + 1);
        }
      };
      await walk(outline);
    }
    if (!collected.length) {
      useUI.getState().toast('info', 'This document has no outline.');
      return;
    }
    useDoc.getState().addBookmarks(
      collected.map((item) => ({ id: uid('bm'), title: item.title, pageIndex: item.pageIndex, pageId: item.pageId, createdAt: Date.now() })),
    );
    useUI.getState().toast('success', `Imported ${collected.length} outline item(s).`);
  } catch (err) {
    useUI.getState().toast('error', err instanceof Error ? err.message : 'Outline import failed.');
  }
}

async function outlinePageIndex(proxy: Awaited<ReturnType<typeof getDocumentProxy>>, dest: unknown): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await proxy.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || !explicit[0]) return null;
    return await proxy.getPageIndex(explicit[0] as never);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

const CommentsPanel: React.FC = () => {
  const comments = useDoc((s) => s.comments);
  const objects = useDoc((s) => s.objects);
  const pages = useDoc((s) => s.pages);
  const goToPage = useUI((s) => s.goToPage);
  const setSelection = useUI((s) => s.setSelection);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const author = useDoc.getState().meta.author || 'You';

  const notes = useMemo(
    () =>
      Object.values(objects)
        .filter((o) => o.kind === 'note')
        .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)),
    [objects],
  );

  const threads = useMemo(() => {
    const toIndex = (pageId: string) => {
      const visual = visualIndexOf(pages, pageId);
      return visual < 0 ? 0 : visual;
    };
    const list = comments
      .filter((c) => (filter === 'all' ? true : filter === 'open' ? c.status === 'open' : c.status !== 'open'))
      .map((c) => ({
        id: c.id,
        objectId: c.objectId,
        pageIndex: toIndex(c.pageId),
        status: c.status,
        createdAt: c.at,
        messages: c.messages,
      }));
    const loose = notes
      .filter((n) => !list.some((c) => c.objectId === n.id))
      .map((n) => ({
        id: `loose-${n.id}`,
        objectId: n.id,
        pageIndex: toIndex(n.pageId),
        status: 'open' as const,
        createdAt: n.createdAt ?? Date.now(),
        messages: [
          {
            id: 'm',
            author: n.kind === 'note' && n.author ? n.author : 'You',
            body: (n as { text?: string }).text ?? '',
            at: n.createdAt ?? Date.now(),
          },
        ],
      }));
    return [...list, ...loose];
  }, [comments, notes, filter, pages]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-ink-700 p-1.5">
        {(['all', 'open', 'resolved'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded px-2 py-0.5 text-2xs capitalize ${
              filter === value ? 'bg-ink-700 text-white' : 'text-ink-400 hover:text-ink-100'
            }`}
          >
            {value}
          </button>
        ))}
        <span className="ml-auto text-2xs text-ink-500">{threads.length} thread(s)</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {threads.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No comments" hint="Use the sticky note tool to start a review thread." />
        ) : (
          <ul className="space-y-2">
            {threads.map((thread) => (
              <li key={thread.id} className="rounded-md border border-ink-700 bg-ink-800/60">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-b border-ink-700 px-2 py-1.5 text-left"
                  onClick={() => {
                    goToPage(thread.pageIndex);
                    setSelection([thread.objectId]);
                  }}
                >
                  <MessageSquare size={12} strokeWidth={1.75} className="text-accent" />
                  <span className="min-w-0 flex-1 truncate text-2xs text-ink-300">
                    Page {thread.pageIndex + 1} · {new Date(thread.createdAt).toLocaleString()}
                  </span>
                  <Badge tone={thread.status === 'open' ? 'accent' : 'success'}>{thread.status}</Badge>
                </button>
                <div className="space-y-1.5 p-2">
                  {thread.messages.map((message) => (
                    <div key={message.id} className="rounded bg-ink-850 p-1.5">
                      <div className="mb-0.5 flex items-center justify-between text-2xs text-ink-500">
                        <span className="font-medium text-ink-300">{message.author}</span>
                        <span>{new Date(message.at).toLocaleTimeString()}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-base text-ink-100">{message.body}</p>
                    </div>
                  ))}
                  <div className="flex items-center gap-1">
                    <Input
                      value={draft[thread.id] ?? ''}
                      placeholder="Reply…"
                      onChange={(e) => setDraft((d) => ({ ...d, [thread.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (draft[thread.id] ?? '').trim()) {
                          useDoc.getState().addCommentMessage(thread.id, draft[thread.id].trim(), author);
                          setDraft((d) => ({ ...d, [thread.id]: '' }));
                        }
                      }}
                      className="h-6 text-2xs"
                    />
                    <IconButton
                      icon={ExternalLink}
                      label="Reply"
                      onClick={() => {
                        const body = (draft[thread.id] ?? '').trim();
                        if (!body) return;
                        useDoc.getState().addCommentMessage(thread.id, body, author);
                        setDraft((d) => ({ ...d, [thread.id]: '' }));
                      }}
                    />
                    <IconButton
                      icon={thread.status === 'open' ? ChevronUp : ChevronDown}
                      label={thread.status === 'open' ? 'Resolve' : 'Reopen'}
                      onClick={() =>
                        useDoc.getState().setCommentStatus(thread.id, thread.status === 'open' ? 'resolved' : 'open')
                      }
                    />
                    <IconButton icon={Trash2} label="Delete thread" variant="danger" onClick={() => {
                      useDoc.getState().removeComment(thread.id);
                      if (!thread.id.startsWith('loose-')) useDoc.getState().removeObjects([thread.objectId]);
                    }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

const AttachmentsPanel: React.FC = () => {
  const attachments = useDoc((s) => s.attachments);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-700 p-2">
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-ink-600 px-3 py-3 text-2xs text-ink-300 hover:border-accent/60 hover:text-white">
          <Upload size={13} strokeWidth={1.75} />
          Attach a file to the PDF
          <input
            type="file"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              for (const file of files) {
                useDoc.getState().addAttachment({
                  id: uid('att'),
                  name: file.name,
                  mime: file.type || 'application/octet-stream',
                  size: file.size,
                  bytes: new Uint8Array(await file.arrayBuffer()),
                });
              }
              if (files.length) useUI.getState().toast('success', `${files.length} attachment(s) added.`);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {attachments.length === 0 ? (
          <EmptyState icon={Paperclip} title="No attachments" hint="Attach source files, spreadsheets or images for the reader." />
        ) : (
          <ul className="space-y-1">
            {attachments.map((att) => (
              <li key={att.id} className="flex items-center gap-2 rounded border border-ink-700 bg-ink-800/60 px-2 py-1.5">
                <Paperclip size={12} strokeWidth={1.75} className="shrink-0 text-ink-400" />
                <span className="min-w-0 flex-1 truncate text-base text-ink-100">{att.name}</span>
                <span className="shrink-0 text-2xs text-ink-500">{(att.size / 1024).toFixed(0)} KB</span>
                <button
                  type="button"
                  title="Remove"
                  onClick={() => useDoc.getState().removeAttachment(att.id)}
                  className="shrink-0 rounded p-0.5 text-ink-500 hover:text-red-300"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 px-1 text-2xs leading-4 text-ink-500">
          Attachments are embedded into the exported PDF as real file-annotations, so they travel with the document.
        </p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

const SearchPanel: React.FC = () => {
  const query = useUI((s) => s.searchQuery);
  const setQuery = useUI((s) => s.setSearchQuery);
  const results = useUI((s) => s.searchResults);
  const setResults = useUI((s) => s.setSearchResults);
  const cursor = useUI((s) => s.searchCursor);
  const setCursor = useUI((s) => s.setSearchCursor);
  const options = useUI((s) => s.searchOptions);
  const setOptions = useUI((s) => s.setSearchOptions);
  const goToPage = useUI((s) => s.goToPage);
  const pages = useDoc((s) => s.pages);
  const sources = useDoc((s) => s.sources);
  const [scope, setScope] = useState<'current' | 'all'>('all');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!query.trim()) return;
    setBusy(true);
    const collected: SearchMatch[] = [];
    const active = pages.filter((p) => !p.deleted);
    const targets = scope === 'current' ? active.slice(useUI.getState().currentPage, useUI.getState().currentPage + 1) : active;
    try {
      for (const page of targets) {
        const source = sources[page.sourceId];
        if (!source) continue;
        const data = await getPageTextData(source, page.sourceIndex);
        const ocr = useDoc.getState().ocr[page.id];
        const searchable = data.items.length || !ocr?.words.length
          ? data
          : {
              ...data,
              text: ocr.text,
              items: ocr.words.map((word) => ({
                str: word.text,
                quads: [word.rect],
                origin: { x: word.rect.x, y: word.rect.y },
                fontSize: word.rect.h,
                fontName: 'OCR',
                dir: 'ltr' as const,
                transform: [word.rect.h, 0, 0, word.rect.h, word.rect.x, word.rect.y] as [number, number, number, number, number, number],
              })),
            };
        collected.push(...findInPage(page.id, visualIndexOf(pages, page.id), searchable, query, options));
      }
      setResults(collected);
      if (collected.length) goToPage(collected[0].pageIndex);
      else useUI.getState().toast('info', 'No matches found.');
    } catch (err) {
      useUI.getState().toast('error', err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  };

  const step = (delta: number) => {
    if (!results.length) return;
    const next = (cursor + delta + results.length) % results.length;
    setCursor(next);
    goToPage(results[next].pageIndex);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-ink-700 p-2">
        <div className="flex items-center gap-1">
          <Input
            value={query}
            autoFocus
            placeholder="Find in document…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void run();
              if (e.key === 'F3') step(1);
            }}
            className="h-7 text-base"
          />
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void run()}>
            {busy ? '…' : 'Find'}
          </Button>
        </div>
        <div className="flex items-center gap-3 text-2xs text-ink-400">
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              checked={options.matchCase}
              onChange={(e) => setOptions({ matchCase: e.target.checked })}
            />
            Match case
          </label>
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              checked={options.wholeWord}
              onChange={(e) => setOptions({ wholeWord: e.target.checked })}
            />
            Whole words
          </label>
          <Select
            className="ml-auto w-24"
            value={scope}
            onChange={(v) => setScope(v as 'current' | 'all')}
            options={[
              { value: 'all', label: 'All pages' },
              { value: 'current', label: 'This page' },
            ]}
          />
        </div>
        {results.length ? (
          <div className="flex items-center gap-2 text-2xs text-ink-300">
            <span>
              {cursor + 1} of {results.length} matches
            </span>
            <span className="ml-auto flex items-center gap-1">
              <IconButton icon={ChevronUp} label="Previous match" onClick={() => step(-1)} />
              <IconButton icon={ChevronDown} label="Next match" onClick={() => step(1)} />
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {results.length === 0 ? (
          <EmptyState icon={Search} title="Search the document" hint="Matches are highlighted in the page and listed here." />
        ) : (
          <ul className="space-y-1">
            {results.map((match, index) => (
              <li key={`${match.pageId}-${index}`}>
                <button
                  type="button"
                  onClick={() => {
                    setCursor(index);
                    goToPage(match.pageIndex);
                  }}
                  className={`w-full rounded px-2 py-1.5 text-left text-2xs ${
                    index === cursor ? 'bg-accent/15 text-white' : 'text-ink-300 hover:bg-ink-800'
                  }`}
                >
                  <span className="mb-0.5 block text-ink-500">
                    Page {match.pageIndex + 1}
                    {match.itemIndex !== undefined ? ` · item ${match.itemIndex + 1}` : ''}
                  </span>
                  <span className="line-clamp-2">{match.snippet || match.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-ink-700 p-2">
        <Button
          size="sm"
          variant="ghost"
          full
          onClick={() => {
            const text = results.map((r) => `Page ${r.pageIndex + 1}: ${r.text}`).join('\n');
            void navigator.clipboard.writeText(text).then(() => useUI.getState().toast('success', 'Matches copied.'));
          }}
        >
          <Copy size={12} strokeWidth={1.75} /> Copy all matches
        </Button>
      </div>
    </div>
  );
};
