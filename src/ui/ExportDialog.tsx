import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileArchive, FileDown, FileImage, FileText, FileType2, Info } from 'lucide-react';
import { EXPORT_FORMATS } from '../core/exporter';
import type { ExportFormat, ExportOptions } from '../core/types';
import { useDoc } from '../state/store';
import { useUI } from '../state/ui';
import { Button, Field, Input, Modal, Select, Slider, Toggle } from './primitives';
import { defaultExportOptions, runExport, saveSplit, type ExportOutcome } from './actions';
import { formatBytes, parsePageRange } from '../core/utils';

const GROUP_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  pdf: FileDown,
  image: FileImage,
  text: FileText,
  office: FileType2,
  data: FileArchive,
};

export const ExportDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const pages = useDoc((s) => s.pages).filter((p) => !p.deleted);
  const docName = useDoc((s) => s.docName);
  const objects = useDoc((s) => s.objects);
  const sources = useDoc((s) => s.sources);
  const ocr = useDoc((s) => s.ocr);
  const currentPage = useUI((s) => s.currentPage);
  const [options, setOptions] = useState<ExportOptions>(() => ({ ...defaultExportOptions(), format: 'pdf' }));
  const [busy, setBusy] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [fileName, setFileName] = useState(docName);
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null);

  // Reset the (editable) file name and any previous result each time the
  // dialog opens, so a stale "export failed" banner is never shown.
  useEffect(() => {
    if (open) {
      setFileName(docName);
      setOutcome(null);
    }
  }, [open, docName]);

  const patch = (next: Partial<ExportOptions>) => setOptions((prev) => ({ ...prev, ...next }));

  const groups = EXPORT_FORMATS.reduce<Record<string, typeof EXPORT_FORMATS>>((acc, format) => {
    acc[format.group] = [...(acc[format.group] ?? []), format];
    return acc;
  }, {});

  const stats = useMemo(() => {
    const totalBytes = Object.values(sources).reduce((sum, s) => sum + (s.bytes?.byteLength ?? 0), 0);
    const objectCount = Object.values(objects).length;
    const ocrPages = Object.keys(ocr).length;
    const recognised = Object.values(ocr).filter((r) => r.words.length).length;
    return { totalBytes, objectCount, ocrPages, recognised };
  }, [sources, objects, ocr]);

  const exportNow = async () => {
    setBusy(true);
    setOutcome(null);
    const result = await runExport(options, { filename: fileName.trim() || docName, toast: false });
    setOutcome(result);
    setBusy(false);
    // Close on a clean export; keep the dialog open when the save failed or
    // some edits could not be applied, so the user sees what went wrong.
    if (result.ok && (result.stats?.editsFailed ?? 0) === 0) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export"
      width={760}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-2xs text-ink-400">
            {pages.length} page(s) · {objectCountLabel(stats.objectCount)} · source {formatBytes(stats.totalBytes)}
            {stats.ocrPages ? ` · OCR on ${stats.ocrPages} page(s)` : ''}
          </span>
          <span className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={FileDown} disabled={busy || !pages.length} onClick={() => void exportNow()}>
              {busy ? 'Exporting…' : 'Export'}
            </Button>
          </span>
        </div>
      }
    >
      {outcome ? <ExportStatus outcome={outcome} /> : null}
      <div className="grid grid-cols-[1fr_240px] gap-4">
        <div className="space-y-4">
          {Object.entries(groups).map(([group, formats]) => {
            const Icon = GROUP_ICONS[group] ?? FileDown;
            return (
              <div key={group}>
                <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">
                  <Icon size={12} strokeWidth={1.75} /> {group}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {formats.map((format) => (
                    <button
                      key={format.id}
                      type="button"
                      onClick={() => patch({ format: format.id as ExportFormat })}
                      className={`rounded-md border px-2.5 py-2 text-left transition-colors ${
                        options.format === format.id
                          ? 'border-accent bg-accent/10'
                          : 'border-ink-700 bg-ink-800/50 hover:border-ink-500'
                      }`}
                    >
                      <span className="block text-base text-ink-100">{format.label}</span>
                      <span className="block text-2xs leading-4 text-ink-500">{format.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3 border-l border-ink-700 pl-4">
          <Field label="File name" hint="Editable — the download is saved under this name">
            <Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder={docName || 'document'} className="h-7" />
          </Field>
          <Field label="Pages">
            <Select
              value={options.pages}
              onChange={(v) => patch({ pages: v as ExportOptions['pages'] })}
              options={[
                { value: 'all', label: 'All pages' },
                { value: 'current', label: `Current page (${currentPage + 1})` },
                { value: 'custom', label: 'Custom range' },
              ]}
            />
          </Field>
          {options.pages === 'custom' ? (
            <Field label="Range" hint="e.g. 1-3, 5, 8-10">
              <Input
                value={options.customPages}
                placeholder="1-3, 5"
                onChange={(e) => patch({ customPages: e.target.value })}
                className="h-7"
              />
              <span className="mt-1 block text-2xs text-ink-500">
                {parsePageRange(options.customPages, pages.length).length} page(s) selected
              </span>
            </Field>
          ) : null}

          {options.format === 'png' || options.format === 'jpeg' || options.format === 'webp' || options.format === 'pdf-flat' ? (
            <>
              <Slider
                label="Resolution scale"
                min={0.5}
                max={4}
                step={0.25}
                value={options.scale}
                onChange={(scale) => patch({ scale })}
                suffix="×"
              />
              <Slider
                label="Image quality"
                min={30}
                max={100}
                step={1}
                value={options.quality}
                onChange={(quality) => patch({ quality })}
                suffix="%"
              />
            </>
          ) : null}

          {options.format.startsWith('pdf') || options.format === 'png' ? (
            <div className="space-y-2 rounded-md border border-ink-700 bg-ink-800/40 p-2">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">PDF options</p>
              <Toggle
                label="Embed fonts"
                hint="Include DejaVu so text renders identically everywhere"
                checked={!!options.embedFonts}
                onChange={(embedFonts) => patch({ embedFonts })}
              />
              <Toggle
                label="PDF/A conformance"
                hint="Adds ISO 19005-1 XMP metadata"
                checked={!!options.pdfA}
                onChange={(pdfA) => patch({ pdfA })}
              />
              <Toggle
                label="Flatten forms & comments"
                hint="Bake everything into the page content"
                checked={!!options.flatten}
                onChange={(flatten) => patch({ flatten })}
              />
              <Toggle
                label="Include OCR text layer"
                hint="Makes scans searchable"
                checked={options.ocr !== false}
                onChange={(value) => patch({ ocr: value })}
              />
            </div>
          ) : null}

          <div className="rounded-md border border-ink-700 bg-ink-800/40 p-2">
            <p className="mb-1.5 flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-ink-400">
              <Info size={11} strokeWidth={1.75} /> Split on export
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={Math.max(1, pages.length - 1)}
                value={splitCount}
                onChange={(e) => setSplitCount(Math.max(1, Math.min(pages.length - 1, Number(e.target.value))))}
                className="h-7 w-16"
              />
              <span className="text-2xs text-ink-400">files, one per {Math.ceil(pages.length / splitCount)} pages</span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              full
              className="mt-2"
              disabled={pages.length < 2}
              onClick={() => {
                const per = Math.ceil(pages.length / splitCount);
                const result: number[][] = [];
                for (let i = 0; i < pages.length; i += per) {
                  result.push(Array.from({ length: Math.min(per, pages.length - i) }, (_, k) => i + k));
                }
                void saveSplit(result).then(onClose);
              }}
            >
              Export split PDFs
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

function objectCountLabel(count: number): string {
  return `${count} edit${count === 1 ? '' : 's'}`;
}

/**
 * Post-export status: a clean export closes the dialog, but a failed save or
 * failed edits keeps it open and shows exactly what went wrong, including the
 * per-page reasons for each edit that could not be applied.
 */
const ExportStatus: React.FC<{ outcome: ExportOutcome }> = ({ outcome }) => {
  const stats = outcome.stats;
  const parts: string[] = [];
  if (stats) {
    if (stats.editsApplied > 0) parts.push(`${stats.editsApplied} text edit${stats.editsApplied === 1 ? '' : 's'} applied`);
    if (stats.redactions > 0) parts.push(`${stats.redactions} redacted run${stats.redactions === 1 ? '' : 's'} removed`);
    if (stats.ocrReplaced > 0) parts.push(`${stats.ocrReplaced} OCR word${stats.ocrReplaced === 1 ? '' : 's'} replaced`);
    if (stats.editsFailed > 0) parts.push(`${stats.editsFailed} text edit${stats.editsFailed === 1 ? '' : 's'} failed`);
  }
  const details = [...outcome.errors, ...(stats?.editErrors ?? []).filter((e) => !outcome.errors.includes(e))].slice(0, 4);
  if (!outcome.ok) {
    return (
      <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 p-2.5">
        <p className="flex items-center gap-1.5 text-2xs font-semibold text-red-300">
          <AlertTriangle size={13} strokeWidth={1.75} /> Export failed — the file was not saved.
        </p>
        {details.length ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-2xs text-red-200/90">
            {details.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-1 text-2xs text-red-200/70">Fix the problem and export again, or close this dialog.</p>
      </div>
    );
  }
  return (
    <div className="mb-3 rounded-md border border-ink-600 bg-ink-800/50 p-2.5">
      <p className="flex items-center gap-1.5 text-2xs font-semibold text-emerald-300">
        <CheckCircle2 size={13} strokeWidth={1.75} /> Exported {outcome.filename}
        {parts.length ? <span className="font-normal text-ink-300">— {parts.join(', ')}</span> : null}
      </p>
      {details.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-2xs text-amber-200/90">
          {details.map((error, i) => (
            <li key={i}>{error}</li>
          ))}
        </ul>
      ) : null}
      {outcome.warnings.length ? (
        <p className="mt-1 text-2xs text-ink-400">{outcome.warnings[0]}</p>
      ) : null}
      {stats && stats.editsFailed > 0 ? (
        <p className="mt-1 text-2xs text-amber-300/80">
          The failed edits were left as they were in the document; fix them and export again.
        </p>
      ) : null}
    </div>
  );
};
