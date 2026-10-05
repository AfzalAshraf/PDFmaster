import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, FolderOpen, Printer } from 'lucide-react';
import { formatBytes } from '../core/utils';
import { useUI } from '../state/ui';
import { Button } from './primitives';
import { extensionOf, getStagedFile, saveStagedWithPicker } from './stagedFile';

/**
 * The file is already built. This dialog does not pretend a folder was chosen.
 * Download is a real link (a user gesture). "Choose a folder" uses the file
 * picker only when the browser allows it — preview iframes usually do not.
 */
export const FileReadyDialog: React.FC = () => {
  const offer = useUI((s) => s.fileOffer);
  const open = useUI((s) => s.fileOfferOpen);
  const hide = useUI((s) => s.hideFileOffer);
  const toast = useUI((s) => s.toast);
  const [name, setName] = useState(offer?.filename ?? '');
  const [servedUrl, setServedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!offer) return;
    setName(offer.filename);
    setServedUrl(null);
    const file = getStagedFile();
    if (!file || file.id !== offer.id) return;
    let cancelled = false;
    void fetch('/api/save-copy', {
      method: 'POST',
      headers: {
        'content-type': file.mime || 'application/octet-stream',
        'x-filename': file.filename,
      },
      body: file.blob,
    })
      .then(async (res) => (res.ok ? ((await res.json()) as { url?: string; filename?: string }) : null))
      .then((data) => {
        if (cancelled || !data?.url || !data.filename) return;
        setServedUrl(data.url);
        setName(data.filename);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [offer]);

  if (!offer || !open) return null;
  const staged = getStagedFile();
  if (!staged) return null;

  const ext = extensionOf(offer.filename) || (offer.mime === 'application/pdf' ? '.pdf' : '');
  const filename = name.trim() || offer.filename;
  const downloadName = ext && !filename.toLowerCase().endsWith(ext) ? `${filename}${ext}` : filename;
  const isPdf = offer.mime === 'application/pdf' || downloadName.toLowerCase().endsWith('.pdf');
  const href = servedUrl ?? staged.url;

  const chooseFolder = async () => {
    const result = await saveStagedWithPicker(downloadName);
    if (result === 'saved') {
      toast('success', `Saved ${downloadName} in the folder you picked.`);
      return;
    }
    if (result === 'cancelled') return;
    toast(
      'warning',
      'This preview cannot open a folder picker. Use Download — the file goes to your browser’s Downloads folder.',
    );
  };

  const printFile = () => {
    const win = window.open(href, '_blank', 'noopener');
    if (!win) {
      toast('warning', 'A new tab was blocked. Download the file, then print it from your PDF viewer.');
      return;
    }
    const tryPrint = () => {
      try {
        win.focus();
        win.print();
      } catch {
        /* the PDF viewer can print itself */
      }
    };
    win.addEventListener('load', tryPrint);
    window.setTimeout(tryPrint, 800);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" data-testid="file-ready">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={hide} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your copy is ready"
        className="relative z-10 flex max-h-[90vh] w-[min(92vw,640px)] flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-menu"
      >
        <header className="border-b border-ink-700 px-4 py-3">
          <h2 className="text-base font-semibold text-white">Your copy is ready</h2>
          <p className="mt-1 text-xs leading-5 text-ink-300">
            Click Download. Your browser saves it as <span className="font-medium text-ink-100">{downloadName}</span> in
            the Downloads folder. This window cannot choose a folder on your computer — search Downloads for that exact
            name.
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <label className="block text-2xs font-semibold uppercase tracking-wider text-ink-400">
            File name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 font-mono text-sm text-ink-100 outline-none focus:border-accent"
            />
          </label>
          <p className="text-2xs text-ink-400">
            {formatBytes(offer.bytes)}
            {isPdf ? ' · PDF' : ''} · not uploaded
          </p>
          {offer.warnings.length ? (
            <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-2xs text-amber-100">
              {offer.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {isPdf ? (
            <object data={staged.url} type="application/pdf" className="h-72 w-full rounded-md border border-ink-700 bg-white">
              <p className="p-3 text-xs text-ink-700">Preview unavailable here. Use Download or Open.</p>
            </object>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-ink-700 px-4 py-3">
          <Button variant="ghost" onClick={hide}>
            Close
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" icon={FolderOpen} onClick={() => void chooseFolder()}>
            Choose a folder…
          </Button>
          {isPdf ? (
            <Button variant="secondary" icon={Printer} onClick={printFile}>
              Print
            </Button>
          ) : null}
          <a
            href={href}
            target="_blank"
            rel="noopener"
            className="pm-focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-600 bg-ink-750 px-3 text-base font-medium text-ink-100 hover:bg-ink-700"
          >
            <ExternalLink size={15} />
            Open
          </a>
          <a
            href={staged.url}
            download={downloadName}
            className="pm-focus-ring inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-base font-semibold text-white hover:bg-accent-hover"
          >
            <Download size={15} />
            Download
          </a>
        </footer>
      </div>
    </div>
  );
};
