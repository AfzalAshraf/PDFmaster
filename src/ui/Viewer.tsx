import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { FilePlus2, FolderOpen, Loader2, ScanText } from 'lucide-react';
import { useDoc } from '../state/store';
import { useUI } from '../state/ui';
import { PageView } from './PageView';
import { PageSkeleton } from './PageSkeleton';
import { Button } from './primitives';
import { openFilesFromPicker } from './actions';

export const Viewer: React.FC = () => {
  const pages = useDoc((s) => s.pages);
  const sources = useDoc((s) => s.sources);
  const zoom = useUI((s) => s.zoom);
  const setZoom = useUI((s) => s.setZoom);
  const fitMode = useUI((s) => s.fitMode);
  const scrollToPage = useUI((s) => s.scrollToPage);
  const setCurrentPage = useUI((s) => s.setCurrentPage);
  const openDialog = useUI((s) => s.openDialog);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activePages = useMemo(() => pages.filter((p) => !p.deleted), [pages]);

  /* ------------------------------- panning ------------------------------- */
  useEffect(() => {
    const onPan = (event: Event) => {
      const { dx, dy } = (event as CustomEvent<{ dx: number; dy: number }>).detail;
      const node = scrollRef.current;
      if (!node) return;
      node.scrollLeft -= dx;
      node.scrollTop -= dy;
    };
    window.addEventListener('pdfmaster:pan', onPan);
    return () => window.removeEventListener('pdfmaster:pan', onPan);
  }, []);

  /* ------------------------------- fit modes ------------------------------ */
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !activePages.length || fitMode === 'none') return;
    const width = activePages[0].width || 612;
    const height = activePages[0].height || 792;
    const available = node.clientWidth - 64;
    const availableHeight = node.clientHeight - 48;
    const next = fitMode === 'width' ? available / width : Math.min(available / width, availableHeight / height);
    setZoom(Math.max(0.1, Math.min(6, next)), fitMode);
  }, [fitMode, activePages, setZoom]);

  /* --------------------------- scroll -> page sync ------------------------ */
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const center = node.scrollTop + node.clientHeight / 2;
        let best = 0;
        let bestDistance = Infinity;
        node.querySelectorAll<HTMLElement>('[data-page-index]').forEach((element) => {
          const index = Number(element.dataset.pageIndex ?? 0);
          const top = element.offsetTop;
          const middle = top + element.offsetHeight / 2;
          const distance = Math.abs(middle - center);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = index;
          }
        });
        if (useUI.getState().currentPage !== best) setCurrentPage(best);
      });
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      node.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [setCurrentPage]);

  useEffect(() => {
    if (scrollToPage === null) return;
    const node = scrollRef.current?.querySelector<HTMLElement>(`[data-page-index="${scrollToPage}"]`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    useUI.setState({ scrollToPage: null });
  }, [scrollToPage]);

  /* ------------------------------ wheel zoom ------------------------------ */
  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = -event.deltaY * 0.0015;
      setZoom(useUI.getState().zoom + delta);
    },
    [setZoom],
  );

  if (!activePages.length) {
    return (
      <EmptyWorkspace
        onOpen={() => void openFilesFromPicker(true)}
        onBlank={() => openDialog('new-document')}
        onOcr={() => openDialog('ocr')}
      />
    );
  }

  return (
    <div
      ref={scrollRef}
      className="pm-viewer relative flex-1 overflow-auto bg-[#2b2c31] pm-no-print"
      onWheel={onWheel}
      data-testid="viewer"
    >
      <div className="min-h-full px-6 py-4">
        {activePages.map((entry) => {
          const source = sources[entry.sourceId];
          if (!source) return null;
          return entry.mediaWidth === 0 ? (
            <PageSkeleton key={entry.id} entry={entry} zoom={zoom} />
          ) : (
            <PageView key={entry.id} entry={entry} index={entry.index} source={source} />
          );
        })}
        <div className="h-16" />
      </div>
    </div>
  );
};

const EmptyWorkspace: React.FC<{ onOpen: () => void; onBlank: () => void; onOcr: () => void }> = ({
  onOpen,
  onBlank,
  onOcr,
}) => (
  <div className="relative flex flex-1 items-center justify-center overflow-auto bg-[#2b2c31]">
    <div className="w-[min(92vw,620px)] rounded-2xl border border-ink-700/80 bg-ink-850/80 p-8 text-center shadow-panel backdrop-blur">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-accent to-[#c92a1e] text-lg font-bold text-white shadow-lg">
        PDF
      </div>
      <h2 className="text-xl font-semibold text-white">Start with a document</h2>
      <p className="mx-auto mt-2 max-w-md text-base leading-6 text-ink-300">
        Open a PDF, drop files anywhere on this window, or create a blank document. PDFmaster runs entirely in your
        browser — nothing is uploaded.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" icon={FolderOpen} onClick={onOpen}>
          Open PDF
        </Button>
        <Button icon={FilePlus2} onClick={onBlank}>
          Blank document
        </Button>
        <Button icon={ScanText} onClick={onOcr} variant="subtle">
          OCR a scan
        </Button>
      </div>
      <div className="mt-6 flex items-center justify-center gap-2 text-2xs uppercase tracking-wider text-ink-400">
        <Loader2 size={12} className="animate-spin" />
        drop PDF, images, Word, Excel, PowerPoint, text…
      </div>
    </div>
  </div>
);
