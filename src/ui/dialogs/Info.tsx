import React, { useEffect, useState } from 'react';
import {
  FilePlus2,
  FileText,
  HardDrive,
  Keyboard,
  Printer,
  Save,
  ScanText,
  ShieldCheck,
  Sparkles,
  Stamp,
  WifiOff,
} from 'lucide-react';
import { Badge, Button, Field, Input, Modal, Select, Toggle } from '../primitives';
import { useDoc } from '../../state/store';
import { useUI } from '../../state/ui';
import { PAGE_SIZES } from '../../core/constants';
import { createBlankDocument, printDocument, saveProjectFile } from '../actions';
import { uid } from '../../core/utils';
import { getDocumentJS, setDocumentJS } from '../../state/scripts';
import { STAMPS } from '../../core/constants';

/* ------------------------------------------------------------------ */
/* New document                                                        */
/* ------------------------------------------------------------------ */

export const NewDocumentDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [size, setSize] = useState('a4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [custom, setCustom] = useState({ w: 595, h: 842 });
  const [customMode, setCustomMode] = useState(false);
  const [count, setCount] = useState(1);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New document"
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            icon={FilePlus2}
            onClick={async () => {
              const preset = PAGE_SIZES[size];
              const portrait: [number, number] = customMode
                ? [custom.w, custom.h]
                : [preset?.w ?? 595, preset?.h ?? 842];
              const dims: [number, number] = orientation === 'landscape' ? [portrait[1], portrait[0]] : portrait;
              await createBlankDocument(size, { w: dims[0], h: dims[1] });
              for (let i = 1; i < count; i += 1) {
                await useDoc.getState().addBlankPage(dims, useDoc.getState().pages.length);
              }
              onClose();
            }}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Page size">
          <Select
            value={customMode ? 'custom' : size}
            onChange={(v) => {
              if (v === 'custom') setCustomMode(true);
              else {
                setCustomMode(false);
                setSize(v);
              }
            }}
            options={[
              ...Object.entries(PAGE_SIZES)
                .filter(([key]) => key !== 'custom')
                .map(([key, value]) => ({ value: key, label: value.label })),
              { value: 'custom', label: 'Custom…' },
            ]}
          />
        </Field>
        {customMode ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Width (pt)">
              <Input type="number" value={custom.w} onChange={(e) => setCustom({ ...custom, w: Number(e.target.value) })} />
            </Field>
            <Field label="Height (pt)">
              <Input type="number" value={custom.h} onChange={(e) => setCustom({ ...custom, h: Number(e.target.value) })} />
            </Field>
          </div>
        ) : null}
        <Field label="Orientation">
          <Select
            value={orientation}
            onChange={(v) => setOrientation(v as 'portrait' | 'landscape')}
            options={[
              { value: 'portrait', label: 'Portrait' },
              { value: 'landscape', label: 'Landscape' },
            ]}
          />
        </Field>
        <Field label="Number of pages">
          <Input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value))))} />
        </Field>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

export const AttachmentsDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const attachments = useDoc((s) => s.attachments);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="File attachments"
      width={520}
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600 px-4 py-5 text-base text-ink-300 hover:border-accent/60 hover:text-white">
          <FilePlus2 size={15} strokeWidth={1.75} /> Choose files to embed
          <input
            type="file"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              for (const file of files) {
                const bytes = new Uint8Array(await file.arrayBuffer());
                useDoc.getState().addAttachment({
                  id: uid('att'),
                  name: file.name,
                  mime: file.type || 'application/octet-stream',
                  bytes,
                  size: file.size,
                });
              }
              if (files.length) useUI.getState().toast('success', `${files.length} attachment(s) embedded.`);
              e.target.value = '';
            }}
          />
        </label>
        {attachments.length === 0 ? (
          <p className="text-2xs text-ink-500">No attachments yet. Embedded files appear in the reader's attachment pane.</p>
        ) : (
          <ul className="space-y-1">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center gap-2 rounded border border-ink-700 bg-ink-800/60 px-2 py-1.5">
                <FileText size={13} strokeWidth={1.75} className="text-ink-400" />
                <span className="min-w-0 flex-1 truncate text-base text-ink-100">{attachment.name}</span>
                <span className="text-2xs text-ink-500">{(attachment.size / 1024).toFixed(0)} KB</span>
                <button
                  type="button"
                  className="text-ink-500 hover:text-red-300"
                  onClick={() => useDoc.getState().removeAttachment(attachment.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Document JavaScript                                                 */
/* ------------------------------------------------------------------ */

export const JavascriptDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [script, setScript] = useState(() => getDocumentJS());
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Document JavaScript"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={() => setScript('')}>
            Clear
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            onClick={() => {
              setDocumentJS(script);
              useUI.getState().toast('success', script.trim() ? 'JavaScript will be embedded on export.' : 'Document JavaScript removed.');
              onClose();
            }}
          >
            Save script
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          spellCheck={false}
          rows={12}
          placeholder={'// Runs when the PDF is opened\napp.alert("Hello from PDFmaster");'}
          className="pm-focus-ring w-full rounded-md border border-ink-600 bg-ink-950 p-3 font-mono text-2xs leading-5 text-ink-100"
        />
        <p className="text-2xs leading-4 text-amber-200/80">
          Document-level JavaScript only runs in readers that allow it (Acrobat with JS enabled). Many viewers ignore it
          for security reasons.
        </p>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Insert image / stamp                                                */
/* ------------------------------------------------------------------ */

export const StampDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const setTool = useUI((s) => s.setTool);
  const setToolOption = useUI((s) => s.setToolOption);
  const stampId = useUI((s) => s.toolOptions.stampId);
  const [custom, setCustom] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose a stamp"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            icon={Stamp}
            onClick={() => {
              if (custom.trim()) {
                setTool('stamp');
                useUI.getState().setToolOptions({ stampId: 'custom' });
                useUI.getState().setPreviewStamp({
                  id: uid('stamp'),
                  pageId: '',
                  kind: 'stamp',
                  x: 0,
                  y: 0,
                  w: 160,
                  h: 56,
                  rotation: 0,
                  opacity: 1,
                  label: custom.trim().toUpperCase(),
                  color: '#c92a1e',
                  variant: 'dynamic',
                });
              } else {
                setToolOption('stampId', stampId);
                setTool('stamp');
              }
              onClose();
            }}
          >
            Use stamp
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {STAMPS.map((stamp) => (
          <button
            key={stamp.id}
            type="button"
            onClick={() => useUI.getState().setToolOptions({ stampId: stamp.id })}
            className={`rounded-md border p-3 text-center transition-colors ${
              stampId === stamp.id ? 'border-accent bg-accent/10' : 'border-ink-700 hover:border-ink-500'
            }`}
          >
            <span className="block text-base font-bold uppercase tracking-wide" style={{ color: stamp.color }}>
              {stamp.label}
            </span>
          </button>
        ))}
      </div>
      <Field label="Custom stamp text">
        <Input value={custom} placeholder="e.g. RECEIVED" onChange={(e) => setCustom(e.target.value)} className="mt-3" />
      </Field>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Print                                                               */
/* ------------------------------------------------------------------ */

export const PrintDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const pages = useDoc((s) => s.pages).filter((p) => !p.deleted);
  const [flatten, setFlatten] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Print"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            icon={Printer}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await printDocument();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Preparing…' : 'Open print dialog'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-base text-ink-300">
          {pages.length} page(s) will be flattened into a temporary PDF and opened in your browser's print dialog. Nothing
          leaves your device.
        </p>
        <Toggle label="Flatten annotations and forms" hint="Guarantees the printed output matches the screen." checked={flatten} onChange={setFlatten} />
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Save as                                                             */
/* ------------------------------------------------------------------ */

export const SaveAsDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const docName = useDoc((s) => s.docName);
  const [name, setName] = useState(docName);
  useEffect(() => setName(docName), [docName, open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save a copy"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            icon={Save}
            onClick={() => {
              useDoc.getState().setDocName(name);
              void saveProjectFile();
              onClose();
            }}
          >
            Save project file
          </Button>
        </>
      }
    >
      <Field label="File name">
        <Input value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} />
      </Field>
      <p className="mt-2 text-2xs leading-4 text-ink-500">
        Saves an editable .pdfmaster.json project (document structure plus embedded sources). Use Export for a real PDF.
      </p>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* About & shortcuts                                                   */
/* ------------------------------------------------------------------ */

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'File',
    items: [
      ['Ctrl + O', 'Open a document'],
      ['Ctrl + S', 'Save a copy (PDF)'],
      ['Ctrl + Shift + E', 'Export as…'],
      ['Ctrl + P', 'Print'],
    ],
  },
  {
    group: 'Edit',
    items: [
      ['Ctrl + Z / Ctrl + Shift + Z', 'Undo / Redo'],
      ['Ctrl + X / C / V', 'Cut, copy, paste objects'],
      ['Ctrl + D', 'Duplicate selection'],
      ['Delete', 'Delete selection'],
      ['Ctrl + F', 'Find text'],
      ['F3 / Shift + F3', 'Next / previous match'],
    ],
  },
  {
    group: 'View',
    items: [
      ['Ctrl + = / Ctrl + -', 'Zoom in / out'],
      ['Ctrl + 0', 'Actual size'],
      ['Ctrl + 1 / Ctrl + 2', 'Fit width / fit page'],
      ['Ctrl + mouse wheel', 'Zoom at pointer'],
      ['Page Up / Page Down', 'Previous / next page'],
      ['Space + drag', 'Pan the document'],
    ],
  },
  {
    group: 'Tools',
    items: [
      ['V / H', 'Select / pan — or click those buttons'],
      ['T / E', 'Add text / edit text — or click those buttons'],
      ['I / R / D', 'Image / shape / draw'],
      ['U / N / S', 'Highlight / note / stamp'],
      ['X', 'Redact'],
      ['Esc', 'Return to the select tool'],
      ['Ctrl + K', 'Command palette'],
    ],
  },
];

export const ShortcutsDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Keyboard shortcuts"
    width={620}
    footer={<Button variant="primary" onClick={onClose}>Close and use the tool bar</Button>}
  >
    <p className="mb-4 rounded-md border border-accent/40 bg-accent/10 p-3 text-xs leading-5 text-ink-100">
      These are keyboard keys, not the tools. The tools are the labeled buttons under the menu — Edit text, Edit pages
      (rotate, insert, delete, crop), Fill &amp; sign, and Save a copy. Click one, then click the page. Close this
      dialog to use them.
    </p>
    <div className="grid grid-cols-2 gap-5">
      {SHORTCUTS.map((section) => (
        <section key={section.group} className="space-y-1.5">
          <h4 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">
            <Keyboard size={12} strokeWidth={1.75} /> {section.group}
          </h4>
          <ul className="space-y-1">
            {section.items.map(([keys, label]) => (
              <li key={keys} className="flex items-center justify-between gap-2 text-2xs">
                <span className="text-ink-300">{label}</span>
                <kbd className="shrink-0 rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-100">
                  {keys}
                </kbd>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  </Modal>
);

export const AboutDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (
  <Modal
    open={open}
    onClose={onClose}
    title="About PDFmaster"
    width={480}
    footer={<Button variant="primary" onClick={onClose}>Close</Button>}
  >
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-accent to-[#c92a1e] text-base font-bold text-white">
          PDF
        </span>
        <div>
          <h3 className="text-lg font-semibold text-white">PDFmaster</h3>
          <p className="text-2xs text-ink-400">A local-first PDF editor for browser and desktop.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="success">
          <WifiOff size={10} strokeWidth={1.75} /> Works offline
        </Badge>
        <Badge tone="accent">
          <ShieldCheck size={10} strokeWidth={1.75} /> AES-256 encryption
        </Badge>
        <Badge tone="neutral">
          <ScanText size={10} strokeWidth={1.75} /> OCR in 18 languages
        </Badge>
        <Badge tone="neutral">
          <HardDrive size={10} strokeWidth={1.75} /> No uploads, ever
        </Badge>
      </div>
      <ul className="space-y-1.5 text-2xs leading-5 text-ink-300">
        <li>• Edit existing PDF text, place new text with embedded fonts, insert and replace images.</li>
        <li>• Full annotation set: highlights, underlines, sticky notes, ink, shapes, stamps, signatures, links and measurements.</li>
        <li>• True redaction — covered text is removed from the content stream, not just painted over.</li>
        <li>• Page tools: reorder, rotate, crop, split, extract, merge, watermark, headers, page numbers and Bates numbering.</li>
        <li>• Fillable forms, PDF/A output, OCR text layers and PKCS#7 digital signatures.</li>
        <li>• Export to PDF, PNG, JPEG, WebP, SVG, text, Markdown, HTML, CSV, JSON, Word, PowerPoint and Excel.</li>
      </ul>
      <p className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800/50 p-2 text-2xs text-ink-400">
        <Sparkles size={12} strokeWidth={1.75} className="text-accent" />
        Built with pdf.js, pdf-lib, tesseract.js, @signpdf, React and Vite. Documents stay on your device; PDFmaster is an independent project, not affiliated with Adobe.
      </p>
    </div>
  </Modal>
);
