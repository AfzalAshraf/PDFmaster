import React, { useEffect, useState } from 'react';
import {
  Clock,
  FilePlus2,
  FileText,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  ScanText,
  Shield,
  Sparkles,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { Button } from './primitives';
import { createBlankDocument, importFiles, openFilesFromPicker, pickFiles } from './actions';
import { useDoc } from '../state/store';
import { useUI } from '../state/ui';
import { clearRecents, listRecents, type RecentEntry } from '../core/storage';
import { formatBytes, timeAgo } from '../core/utils';

const FEATURES = [
  { icon: FileText, title: 'Edit text & images', body: 'Rewrite existing PDF text in place, add new text with real embedded fonts, swap images.' },
  { icon: Sparkles, title: 'Annotate everything', body: 'Highlights, notes, ink, shapes, stamps, links, measurements and signatures.' },
  { icon: Shield, title: 'Redact & protect', body: 'True redaction that deletes the covered text, AES-256 passwords and permissions.' },
  { icon: ImageIcon, title: 'Pages & export', body: 'Reorder, crop, watermark, split, then export to PDF, Office, images or text.' },
  { icon: ScanText, title: 'OCR in 18 languages', body: 'Turn scans into searchable documents with an invisible text layer.' },
  { icon: WifiOff, title: 'Offline & private', body: 'Installs as an app and works with no network. Nothing is ever uploaded.' },
];

export const HomeView: React.FC = () => {
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const openDialog = useUI((s) => s.openDialog);
  const setBusy = useUI((s) => s.setBusy);

  useEffect(() => {
    void listRecents().then(setRecents);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-[#24252a]">
      <div className="mx-auto w-[min(1100px,92vw)] py-12">
        <header className="text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-accent to-[#b3241a] text-xl font-bold text-white shadow-lg">
            PDF
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">PDFmaster</h1>
          <p className="mx-auto mt-2 max-w-xl text-base leading-6 text-ink-300">
            A powerful PDF editor that runs on your device. Edit, annotate, protect, OCR and export — your files never
            leave this device.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" icon={FolderOpen} onClick={() => void openFilesFromPicker(true)}>
              Open PDF
            </Button>
            <Button icon={FilePlus2} onClick={() => openDialog('new-document')}>
              Blank document
            </Button>
            <Button
              icon={ImageIcon}
              variant="subtle"
              onClick={async () => {
                const files = await pickFiles('image/*', true);
                if (files.length) await importFiles(files, { replace: true });
              }}
            >
              Images → PDF
            </Button>
            <Button icon={ScanText} variant="subtle" onClick={() => openDialog('ocr')}>
              OCR a scan
            </Button>
          </div>
        </header>

        {recents.length ? (
          <section className="mt-12">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
                <Clock size={13} strokeWidth={1.75} /> Recent documents
              </h2>
              <button
                type="button"
                className="flex items-center gap-1 text-2xs text-ink-500 hover:text-ink-200"
                onClick={async () => {
                  await clearRecents();
                  setRecents([]);
                }}
              >
                <Trash2 size={11} strokeWidth={1.75} /> Clear
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {recents.slice(0, 6).map((recent) => (
                <li key={`${recent.name}-${recent.at}`}>
                  <button
                    type="button"
                    onClick={async () => {
                      setBusy({ active: true, label: 'Restoring session', progress: 10 });
                      try {
                        const restored = await useDoc.getState().restoreRecent(recent.name);
                        if (!restored) useUI.getState().toast('warning', 'That document is no longer stored locally.');
                      } finally {
                        setBusy({ active: false, label: '', progress: 0 });
                      }
                    }}
                    className="w-full rounded-lg border border-ink-700 bg-ink-850/60 p-3 text-left transition-colors hover:border-accent/50"
                  >
                    <span className="flex items-center gap-2">
                      <FileText size={14} strokeWidth={1.75} className="text-accent" />
                      <span className="min-w-0 flex-1 truncate text-base text-ink-100">{recent.name}</span>
                    </span>
                    <span className="mt-1 flex items-center justify-between text-2xs text-ink-500">
                      <span>{recent.pages} pages · {formatBytes(recent.size)}</span>
                      <span>{timeAgo(recent.at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-12">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
            <Sparkles size={13} strokeWidth={1.75} /> What you can do
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-xl border border-ink-700 bg-ink-850/60 p-4">
                <feature.icon size={17} strokeWidth={1.75} className="text-accent" />
                <h3 className="mt-2 text-base font-semibold text-ink-50">{feature.title}</h3>
                <p className="mt-1 text-2xs leading-4 text-ink-400">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-3 sm:grid-cols-3">
          {[
            { icon: HardDrive, title: 'Local-first', body: 'Documents stay in memory and autosave to this installation’s local IndexedDB.' },
            { icon: Shield, title: 'Private by design', body: 'No accounts, no telemetry, no upload endpoints — open the network tab and check.' },
            { icon: WifiOff, title: 'Installable', body: 'Add PDFmaster to your desktop or home screen and use it without a connection.' },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 rounded-xl border border-ink-700 bg-ink-850/40 p-4">
              <item.icon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <h3 className="text-base font-semibold text-ink-50">{item.title}</h3>
                <p className="mt-1 text-2xs leading-4 text-ink-400">{item.body}</p>
              </div>
            </div>
          ))}
        </section>

        <footer className="mt-12 text-center text-2xs text-ink-500">
          Press <kbd className="rounded border border-ink-600 px-1.5 py-0.5 font-mono">Ctrl</kbd>+
          <kbd className="rounded border border-ink-600 px-1.5 py-0.5 font-mono">K</kbd> for the command palette, or drag
          any file onto this window.
          <button type="button" className="ml-2 underline hover:text-ink-200" onClick={() => openDialog('about')}>
            About PDFmaster
          </button>
        </footer>
      </div>
    </div>
  );
};

export const HOME_FEATURES = FEATURES;
export const createBlank = createBlankDocument;
