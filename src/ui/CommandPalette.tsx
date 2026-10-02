import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Command, Search } from 'lucide-react';
import { useUI } from '../state/ui';
import { useDoc } from '../state/store';
import { TOOL_DEFS, type ToolId } from '../core/constants';
import { addImageToPage, openFilesFromPicker, printDocument, quickSave, runOcr } from './actions';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export const CommandPalette: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo<CommandItem[]>(() => {
    const ui = useUI.getState();
    const doc = useDoc.getState();
    const page = doc.pages.filter((p) => !p.deleted)[ui.currentPage];
    const tools = Object.values(TOOL_DEFS).map((tool) => ({
      id: `tool-${tool.id}`,
      label: `Tool: ${tool.label}`,
      hint: tool.shortcut ? `Shortcut ${tool.shortcut}` : undefined,
      run: () => ui.setTool(tool.id as ToolId),
    }));
    return [
      { id: 'open', label: 'Open PDF…', hint: 'Ctrl+O', run: () => void openFilesFromPicker(true) },
      { id: 'save', label: 'Save a copy (PDF)', hint: 'Ctrl+S', run: () => void quickSave() },
      { id: 'export', label: 'Export as…', hint: 'Ctrl+Shift+E', run: () => ui.openDialog('export') },
      { id: 'print', label: 'Print…', hint: 'Ctrl+P', run: () => void printDocument() },
      { id: 'security', label: 'Password & permissions…', run: () => ui.openDialog('security') },
      { id: 'digital-sign', label: 'Digital signature (certificate)…', run: () => ui.openDialog('digital-sign') },
      { id: 'sign', label: 'Fill & sign…', run: () => ui.openDialog('sign') },
      { id: 'ocr', label: 'Recognise text (OCR)…', run: () => ui.openDialog('ocr') },
      { id: 'watermark', label: 'Add watermark…', run: () => ui.openDialog('watermark') },
      { id: 'header-footer', label: 'Header & footer…', run: () => ui.openDialog('header-footer') },
      { id: 'page-numbers', label: 'Page numbers…', run: () => ui.openDialog('page-numbers') },
      { id: 'bates', label: 'Bates numbering…', run: () => ui.openDialog('bates') },
      { id: 'metadata', label: 'Document properties…', run: () => ui.openDialog('metadata') },
      { id: 'compress', label: 'Compress & optimise…', run: () => ui.openDialog('compress') },
      { id: 'split', label: 'Split document…', run: () => ui.openDialog('split') },
      { id: 'attachments', label: 'File attachments…', run: () => ui.openDialog('attachments') },
      { id: 'javascript', label: 'Document JavaScript…', run: () => ui.openDialog('javascript') },
      { id: 'blank', label: 'New blank document…', run: () => ui.openDialog('new-document') },
      { id: 'insert-image', label: 'Insert image…', run: () => page && void addImageToPage(page.id) },
      { id: 'ocr-page', label: 'OCR current page', run: () => void runOcr([page?.id].filter(Boolean) as string[], 'eng', 2.4) },
      { id: 'undo', label: 'Undo', hint: 'Ctrl+Z', run: () => doc.undo() },
      { id: 'redo', label: 'Redo', hint: 'Ctrl+Shift+Z', run: () => doc.redo() },
      { id: 'rotate', label: 'Rotate current page 90°', run: () => page && doc.rotatePages([page.id], 90) },
      { id: 'duplicate', label: 'Duplicate current page', run: () => page && doc.duplicatePages([page.id]) },
      { id: 'delete', label: 'Delete current page', run: () => page && doc.deletePages([page.id]) },
      { id: 'thumbs', label: 'Panel: Page thumbnails', run: () => ui.setLeftPanel('thumbs') },
      { id: 'comments', label: 'Panel: Comments', run: () => ui.setLeftPanel('comments') },
      { id: 'search', label: 'Panel: Search', run: () => ui.setLeftPanel('search') },
      { id: 'organize', label: 'Panel: Organise pages', run: () => ui.setRightPanel('organize') },
      { id: 'forms', label: 'Panel: Form fields', run: () => ui.setRightPanel('forms') },
      { id: 'security-panel', label: 'Panel: Protect', run: () => ui.setRightPanel('security') },
      { id: 'export-panel', label: 'Panel: Export presets', run: () => ui.setRightPanel('export') },
      { id: 'shortcuts', label: 'Keyboard shortcuts', run: () => ui.openDialog('shortcuts') },
      { id: 'about', label: 'About PDFmaster', run: () => ui.openDialog('about') },
      ...tools,
    ];
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 12);
    const needle = query.toLowerCase();
    return commands
      .filter((command) => command.label.toLowerCase().includes(needle))
      .slice(0, 14);
  }, [commands, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((v) => !v);
        setQuery('');
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    const node = listRef.current?.children[cursor] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const runAt = (index: number) => {
    const command = filtered[index];
    if (!command) return;
    setOpen(false);
    command.run();
  };

  return (
    <div className="pm-no-print fixed inset-0 z-[80] flex items-start justify-center bg-black/50 pt-[12vh]" onClick={() => setOpen(false)}>
      <div
        className="w-[min(92vw,620px)] animate-pop-in overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-menu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2.5">
          <Search size={15} strokeWidth={1.75} className="text-ink-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCursor((c) => Math.min(filtered.length - 1, c + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              }
              if (e.key === 'Enter') runAt(cursor);
            }}
            placeholder="Type a command…"
            className="flex-1 bg-transparent text-lg text-white outline-none placeholder:text-ink-500"
          />
          <kbd className="rounded border border-ink-600 px-1.5 py-0.5 text-2xs text-ink-400">Esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-[46vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-base text-ink-500">No matching commands.</li>
          ) : (
            filtered.map((command, index) => (
              <li key={command.id}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => runAt(index)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-base transition-colors ${
                    index === cursor ? 'bg-accent/15 text-white' : 'text-ink-200'
                  }`}
                >
                  <Command size={12} strokeWidth={1.75} className={index === cursor ? 'text-accent' : 'text-ink-500'} />
                  <span className="flex-1 truncate">{command.label}</span>
                  {command.hint ? <span className="text-2xs text-ink-500">{command.hint}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};
