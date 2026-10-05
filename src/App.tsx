import React, { useEffect, useState } from 'react';
import { useDoc } from './state/store';
import { useUI } from './state/ui';
import { useShortcuts } from './hooks/useShortcuts';
import { useTheme } from './hooks/useTheme';
import { MenuBar } from './ui/MenuBar';
import { DocumentTabs } from './ui/DocumentTabs';
import { Toolbar } from './ui/Toolbar';
import { EditRibbon } from './ui/EditRibbon';
import { FileReadyDialog } from './ui/FileReadyDialog';
import { ToolRail } from './ui/ToolRail';
import { Viewer } from './ui/Viewer';
import { LeftPanel } from './ui/LeftPanel';
import { RightPanel } from './ui/RightPanel';
import { PageNavigation } from './ui/PageNavigation';
import { StatusBar } from './ui/StatusBar';
import { Dialogs } from './ui/Dialogs';
import { CommandPalette } from './ui/CommandPalette';
import { BusyOverlay, ToastStack } from './ui/primitives';
import { HomeView } from './ui/HomeView';
import { importFiles, openProjectFile, restoreAutosavedSession } from './ui/actions';
import { storeIndexFromVisual } from './state/store';
import { getDesktopBridge } from './core/desktop';
import { loadPreferences, savePreferences } from './core/storage';

/** Keeps a component crash from taking the whole workspace down. */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('PDFmaster crashed:', error);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-screen w-screen place-items-center bg-ink-900 p-6 text-ink-100">
        <div className="w-[min(92vw,560px)] rounded-xl border border-ink-700 bg-ink-850 p-6 shadow-panel">
          <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
          <p className="mt-2 text-base leading-6 text-ink-300">
            The editor hit an unexpected error. Your documents are still in this tab's memory — reload to continue, and
            use <span className="font-medium text-ink-100">Export</span> first if you were about to save.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-ink-700 bg-ink-950 p-3 text-2xs text-ink-300">
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="pm-focus-ring rounded-md border border-ink-600 px-3 py-1.5 text-base text-ink-100 hover:bg-ink-700"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="pm-focus-ring rounded-md bg-accent px-3 py-1.5 text-base font-semibold text-white hover:bg-accent-hover"
            >
              Reload editor
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const App: React.FC = () => {
  useTheme();
  useShortcuts();
  const pages = useDoc((s) => s.pages);
  const leftPanel = useUI((s) => s.leftPanel);
  const rightPanel = useUI((s) => s.rightPanel);
  const collapsed = useUI((s) => s.collapsed);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);

  /* Crash recovery plus files opened from Windows Explorer in the desktop build. */
  useEffect(() => {
    let cancelled = false;
    let sessionRecovered = false;
    let draining = false;
    let drainAgain = false;
    const desktop = getDesktopBridge();

    const drainDesktopFiles = async () => {
      if (!desktop || !sessionRecovered || cancelled) return;
      if (draining) {
        drainAgain = true;
        return;
      }
      draining = true;
      try {
        do {
          drainAgain = false;
          const pending = await desktop.takePendingFiles();
          if (cancelled || !pending.length) continue;

          const asFile = (entry: (typeof pending)[number]) => {
            const buffer = entry.bytes.buffer.slice(
              entry.bytes.byteOffset,
              entry.bytes.byteOffset + entry.bytes.byteLength,
            ) as ArrayBuffer;
            return new File([buffer], entry.name, { type: 'application/octet-stream' });
          };
          let sourceFiles: File[] = [];
          const openSources = async () => {
            if (!sourceFiles.length) return;
            const files = sourceFiles;
            sourceFiles = [];
            await importFiles(files, { replace: true });
          };

          for (const entry of pending) {
            const file = asFile(entry);
            if (entry.name.toLowerCase().endsWith('.pdfmaster.json')) {
              await openSources();
              await openProjectFile(file);
            } else {
              sourceFiles.push(file);
            }
          }
          await openSources();
        } while (drainAgain && !cancelled);
      } catch (error) {
        useUI.getState().toast('error', error instanceof Error ? error.message : 'Could not open the selected file.');
      } finally {
        draining = false;
      }
    };

    const unsubscribe = desktop?.onFilesAvailable(() => void drainDesktopFiles());
    void restoreAutosavedSession().then(async (restored) => {
      if (cancelled) return;
      if (restored) {
        useUI.getState().toast('info', 'Your previous session was restored.', {
          label: 'Start empty',
          run: () => useDoc.getState().reset(),
        });
      }
      sessionRecovered = true;
      await drainDesktopFiles();
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  /* Warn before leaving with unsaved changes. */
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const doc = useDoc.getState();
      if (!doc.dirty || !doc.pages.length) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  /* Restore panel/zoom preferences (not the document itself). */
  useEffect(() => {
    void loadPreferences()
      .catch(() => undefined)
      .then((prefs) => {
        if (!prefs) {
          setReady(true);
          return;
        }
        useUI.setState({
          zoom: prefs.zoom ?? 1,
          fitMode: prefs.fitMode ?? 'width',
          leftPanel: (prefs.leftPanel as typeof leftPanel) ?? 'thumbs',
          rightPanel: (prefs.rightPanel as typeof rightPanel) ?? 'tools',
          collapsed: prefs.collapsed ?? { left: false, right: false },
          showAnnotations: prefs.showAnnotations ?? true,
          showTextLayer: prefs.showTextLayer ?? true,
        });
        setReady(true);
      });
  }, []);

  /* Persist preferences on change (debounced by the browser's idle queue). */
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      const ui = useUI.getState();
      void savePreferences({
        zoom: ui.zoom,
        fitMode: ui.fitMode,
        leftPanel: ui.leftPanel,
        rightPanel: ui.rightPanel,
        collapsed: ui.collapsed,
        showAnnotations: ui.showAnnotations,
        showTextLayer: ui.showTextLayer,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [ready, leftPanel, rightPanel, collapsed]);

  /* Drag & drop anywhere in the window. */
  useEffect(() => {
    const onOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      setDragging(true);
    };
    const onLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      setDragging(false);
      const files = Array.from(event.dataTransfer.files);
      const dropTarget = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-page-index]');
      if (dropTarget) {
        const index = Number((dropTarget as HTMLElement).dataset.pageIndex ?? 0);
        void importFiles(files, { at: storeIndexFromVisual(useDoc.getState().pages, index) });
      } else {
        void importFiles(files, { replace: false });
      }
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const hasDocument = pages.length > 0;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-ink-900 text-ink-100">
      <MenuBar />
      <DocumentTabs />
      <Toolbar />

      {hasDocument ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <EditRibbon />
          <div className="relative flex min-h-0 flex-1">
            <ToolRail />
            {leftPanel !== 'none' && !collapsed.left ? <LeftPanel /> : null}
            <Viewer />
            {rightPanel !== 'none' && !collapsed.right ? <RightPanel /> : null}
            <PageNavigation />
          </div>
        </div>
      ) : (
        <HomeView />
      )}

      <StatusBar />
      <Dialogs />
      <FileReadyDialog />
      <CommandPalette />
      <ToastStack />
      <BusyOverlay />

      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-ink-950/70 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-accent/70 px-10 py-8 text-center">
            <p className="text-xl font-semibold text-white">Drop to open</p>
            <p className="mt-1 text-base text-ink-300">PDF, images, Word, Excel, PowerPoint, text and more.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const Root: React.FC = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default Root;
