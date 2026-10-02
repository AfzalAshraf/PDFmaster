import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Maximize2,
  Minus,
  Plus,
  Scan,
} from 'lucide-react';
import { useDoc } from '../state/store';
import { useUI } from '../state/ui';
import { Menu, MenuItem, MenuSeparator } from './primitives';

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/** Floating page-navigation + zoom bar, pinned to the bottom of the viewer. */
export const PageNavigation: React.FC = () => {
  const pages = useDoc((s) => s.pages);
  const currentPage = useUI((s) => s.currentPage);
  const goToPage = useUI((s) => s.goToPage);
  const zoom = useUI((s) => s.zoom);
  const zoomIn = useUI((s) => s.zoomIn);
  const zoomOut = useUI((s) => s.zoomOut);
  const setZoom = useUI((s) => s.setZoom);
  const fitMode = useUI((s) => s.fitMode);
  const [draft, setDraft] = useState(String(currentPage + 1));
  const [zoomOpen, setZoomOpen] = useState(false);
  const active = pages.filter((p) => !p.deleted);

  useEffect(() => setDraft(String(currentPage + 1)), [currentPage]);

  const commit = () => {
    const value = Number(draft);
    if (Number.isFinite(value) && value >= 1 && value <= active.length) goToPage(value - 1);
    else setDraft(String(currentPage + 1));
  };

  if (!active.length) return null;

  return (
    <div className="pm-no-print pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-ink-700 bg-ink-850/95 px-2 py-1 shadow-menu backdrop-blur">
        <button
          type="button"
          title="First page"
          disabled={currentPage <= 0}
          onClick={() => goToPage(0)}
          className="pm-focus-ring grid h-6 w-6 place-items-center rounded-full text-ink-200 hover:bg-ink-700 disabled:opacity-30"
        >
          <ChevronsLeft size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="Previous page (Page Up)"
          disabled={currentPage <= 0}
          onClick={() => goToPage(currentPage - 1)}
          className="pm-focus-ring grid h-6 w-6 place-items-center rounded-full text-ink-200 hover:bg-ink-700 disabled:opacity-30"
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
        </button>

        <div className="flex items-center gap-1 px-1 text-xs text-ink-200">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
            inputMode="numeric"
            aria-label="Page number"
            className="pm-focus-ring h-6 w-10 rounded border border-ink-600 bg-ink-900 text-center tabular-nums text-ink-50"
          />
          <span className="text-ink-400">/ {active.length}</span>
        </div>

        <button
          type="button"
          title="Next page (Page Down)"
          disabled={currentPage >= active.length - 1}
          onClick={() => goToPage(currentPage + 1)}
          className="pm-focus-ring grid h-6 w-6 place-items-center rounded-full text-ink-200 hover:bg-ink-700 disabled:opacity-30"
        >
          <ChevronRight size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="Last page"
          disabled={currentPage >= active.length - 1}
          onClick={() => goToPage(active.length - 1)}
          className="pm-focus-ring grid h-6 w-6 place-items-center rounded-full text-ink-200 hover:bg-ink-700 disabled:opacity-30"
        >
          <ChevronsRight size={14} strokeWidth={1.75} />
        </button>

        <span className="mx-1 h-5 w-px bg-ink-700" />

        <button
          type="button"
          title="Zoom out (Ctrl+-)"
          onClick={zoomOut}
          className="pm-focus-ring grid h-6 w-6 place-items-center rounded-full text-ink-200 hover:bg-ink-700"
        >
          <Minus size={13} strokeWidth={2} />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setZoomOpen((v) => !v)}
            className="pm-focus-ring flex h-6 items-center gap-0.5 rounded-full px-2 text-xs tabular-nums text-ink-100 hover:bg-ink-700"
            title="Zoom"
          >
            {Math.round(zoom * 100)}%
            <ChevronDown size={11} strokeWidth={2} />
          </button>
          <Menu open={zoomOpen} onClose={() => setZoomOpen(false)} width={150}>
            <MenuItem
              icon={Scan}
              checked={fitMode === 'width'}
              onClick={() => {
                setZoomOpen(false);
                useUI.setState({ fitMode: 'width' });
              }}
            >
              Fit width
            </MenuItem>
            <MenuItem
              icon={Maximize2}
              checked={fitMode === 'page'}
              onClick={() => {
                setZoomOpen(false);
                useUI.setState({ fitMode: 'page' });
              }}
            >
              Fit page
            </MenuItem>
            <MenuSeparator />
            {ZOOM_PRESETS.map((preset) => (
              <MenuItem
                key={preset}
                checked={Math.abs(zoom - preset) < 0.01}
                onClick={() => {
                  setZoomOpen(false);
                  setZoom(preset);
                }}
              >
                {Math.round(preset * 100)}%
              </MenuItem>
            ))}
          </Menu>
        </div>

        <button
          type="button"
          title="Zoom in (Ctrl+=)"
          onClick={zoomIn}
          className="pm-focus-ring grid h-6 w-6 place-items-center rounded-full text-ink-200 hover:bg-ink-700"
        >
          <Plus size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};
