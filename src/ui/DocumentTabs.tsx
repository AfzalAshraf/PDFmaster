import React from 'react';
import { FileText, Plus, ShieldCheck, X } from 'lucide-react';
import { useDoc } from '../state/store';
import { useUI } from '../state/ui';
import { openFilesFromPicker, saveProjectFile } from './actions';

/** The single-document tab strip, styled like Acrobat's filename bar. */
export const DocumentTabs: React.FC = () => {
  const docName = useDoc((s) => s.docName);
  const dirty = useDoc((s) => s.dirty);
  const pages = useDoc((s) => s.pages);
  const security = useDoc((s) => s.security);
  const setRightPanel = useUI((s) => s.setRightPanel);
  const openDialog = useUI((s) => s.openDialog);
  const active = pages.filter((p) => !p.deleted).length;

  return (
    <div className="pm-no-print flex h-8 items-center gap-2 border-b border-ink-700 bg-ink-900 px-2" data-testid="tabs">
      <div className="flex h-6 max-w-[320px] items-center gap-1.5 rounded-t-md border border-b-0 border-ink-700 bg-ink-800 px-2 text-xs text-ink-100">
        <FileText size={12} strokeWidth={1.75} className="shrink-0 text-accent" />
        <span className="truncate font-medium">{docName || 'Untitled document'}</span>
        {dirty ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Unsaved changes" /> : null}
        <button
          type="button"
          title="Close document"
          onClick={() => useDoc.getState().reset()}
          className="ml-1 grid h-4 w-4 shrink-0 place-items-center rounded text-ink-400 hover:bg-ink-700 hover:text-white"
        >
          <X size={11} strokeWidth={2} />
        </button>
      </div>

      <button
        type="button"
        title="Open another document"
        onClick={() => void openFilesFromPicker(true)}
        className="grid h-5 w-5 place-items-center rounded text-ink-400 transition-colors hover:bg-ink-700 hover:text-white"
      >
        <Plus size={13} strokeWidth={2} />
      </button>

      <div className="ml-auto flex items-center gap-3 text-2xs text-ink-400">
        {security.enabled ? (
          <span className="flex items-center gap-1 text-emerald-400" title="Encrypted on export">
            <ShieldCheck size={11} strokeWidth={1.75} /> AES-256
          </span>
        ) : null}
        <span>{active} page{active === 1 ? '' : 's'}</span>
        <button type="button" className="hover:text-ink-100" onClick={() => setRightPanel('export')}>
          Export presets
        </button>
        <button type="button" className="hover:text-ink-100" onClick={() => void saveProjectFile()}>
          Save project
        </button>
        <button type="button" className="hover:text-ink-100" onClick={() => openDialog('shortcuts')}>
          Shortcuts
        </button>
      </div>
    </div>
  );
};
