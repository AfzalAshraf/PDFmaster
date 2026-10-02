import React, { useEffect, useState } from 'react';
import { Circle, CloudOff, HardDrive, Info } from 'lucide-react';
import { useDoc } from '../state/store';
import { useUI, TOOL_HINTS } from '../state/ui';
import { TOOL_DEFS } from '../core/constants';
import { formatBytes } from '../core/utils';

export const StatusBar: React.FC = () => {
  const tool = useUI((s) => s.tool);
  const statusMessage = useUI((s) => s.statusMessage);
  const currentPage = useUI((s) => s.currentPage);
  const selection = useUI((s) => s.selection);
  const pages = useDoc((s) => s.pages);
  const objects = useDoc((s) => s.objects);
  const sources = useDoc((s) => s.sources);
  const savedAt = useDoc((s) => s.lastSavedAt);
  const dirty = useDoc((s) => s.dirty);
  const setRightPanel = useUI((s) => s.setRightPanel);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const active = pages.filter((p) => !p.deleted);
  const page = active[currentPage];
  const totalBytes = Object.values(sources).reduce((sum, s) => sum + (s.bytes?.byteLength ?? 0), 0);
  const objectCount = page ? (Object.values(objects).filter((o) => o.pageId === page.id).length ?? 0) : 0;
  const hint = statusMessage || TOOL_HINTS[tool] || TOOL_DEFS[tool]?.description || '';

  return (
    <div
      className="pm-no-print flex h-6 items-center gap-3 border-t border-ink-700 bg-ink-850 px-2 text-2xs text-ink-300"
      data-testid="statusbar"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 font-medium text-ink-100">{TOOL_DEFS[tool]?.label ?? 'Select'}</span>
        <span className="truncate">{hint}</span>
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-3">
        {selection.length ? <span className="text-accent">{selection.length} selected</span> : null}
        {objectCount ? <span>{objectCount} object{objectCount === 1 ? '' : 's'} on page</span> : null}
        {page ? (
          <button
            type="button"
            onClick={() => setRightPanel('properties')}
            className="tabular-nums hover:text-ink-100"
            title="Page size"
          >
            {Math.round(page.width)} × {Math.round(page.height)} pt
          </button>
        ) : null}
        {totalBytes ? (
          <span className="flex items-center gap-1" title="Bytes loaded in memory">
            <HardDrive size={10} strokeWidth={1.75} />
            {formatBytes(totalBytes)}
          </span>
        ) : null}
        {savedAt ? (
          <span
            className="flex items-center gap-1"
            title={`Autosaved ${new Date(savedAt).toLocaleTimeString()}`}
          >
            <Circle size={7} className={dirty ? 'fill-amber-400 text-amber-400' : 'fill-emerald-400 text-emerald-400'} />
            {dirty ? 'Saving…' : 'Autosaved'}
          </span>
        ) : null}
        <span className="flex items-center gap-1" title={online ? 'Online — the app still never uploads your files' : 'Offline — everything keeps working'}>
          <CloudOff size={10} strokeWidth={1.75} className={online ? 'opacity-40' : 'text-amber-400'} />
          {online ? 'Local only' : 'Offline'}
        </span>
        <button
          type="button"
          onClick={() => useUI.getState().openDialog('about')}
          className="flex items-center gap-1 hover:text-ink-100"
          title="About PDFmaster"
        >
          <Info size={10} strokeWidth={1.75} />
          v1.0
        </button>
      </span>
    </div>
  );
};
