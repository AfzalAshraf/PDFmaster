import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, Lock, Pen, ScanText, ShieldCheck, Signature, Sparkles, Trash2, Type } from 'lucide-react';
import { Badge, Button, Field, Input, Modal, ProgressBar, Select, Slider, Toggle } from '../primitives';
import { useDoc, defaultWatermark, defaultHeaderFooter, defaultPageNumbers, defaultBates } from '../../state/store';
import { useUI } from '../../state/ui';
import { BODY_FONT_SIZES, STAMPS, TEXT_FONTS } from '../../core/constants';
import type { BatesSettings, HeaderFooterSettings, PageNumberSettings, WatermarkSettings } from '../../core/types';
import { OCR_LANGUAGES } from '../../core/ocr';
import { defaultExportOptions, offerDownload, runExport, runOcr, saveSplit } from '../actions';
import { assetFromCanvas } from '../../core/assets';
import { inspectP12, signPdf, type SignatureInfo } from '../../core/signing';
import { buildInputFromStore } from '../actions';
import { buildPdf } from '../../core/engine';
import { formatBytes, sanitizeFilename, uid } from '../../core/utils';
import { passwordStrength } from '../../core/security';

/* ------------------------------------------------------------------ */
/* Shared building blocks                                              */
/* ------------------------------------------------------------------ */

export const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="space-y-2.5">
    <div>
      <h4 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{title}</h4>
      {hint ? <p className="mt-0.5 text-2xs leading-4 text-ink-500">{hint}</p> : null}
    </div>
    {children}
  </section>
);

const PageScope: React.FC<{
  value: 'all' | 'current' | 'custom';
  range: string;
  currentPage: number;
  total: number;
  onChange: (value: 'all' | 'current' | 'custom', range?: string) => void;
}> = ({ value, range, currentPage, total, onChange }) => (
  <div className="space-y-2">
    <Field label="Apply to">
      <Select
        value={value}
        onChange={(v) => onChange(v as 'all' | 'current' | 'custom', range)}
        options={[
          { value: 'all', label: `All pages (${total})` },
          { value: 'current', label: `Current page (${currentPage + 1})` },
          { value: 'custom', label: 'Custom range' },
        ]}
      />
    </Field>
    {value === 'custom' ? (
      <Field label="Range" hint="e.g. 1-3, 5, 8-10">
        <Input value={range} onChange={(e) => onChange('custom', e.target.value)} className="h-7" placeholder="1-3, 5" />
      </Field>
    ) : null}
  </div>
);

/* ------------------------------------------------------------------ */
/* Watermark                                                           */
/* ------------------------------------------------------------------ */

export const WatermarkDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const watermark = useDoc((s) => s.watermark);
  const setWatermark = useDoc((s) => s.setWatermark);
  const currentPage = useUI((s) => s.currentPage);
  const total = useDoc((s) => s.pages).filter((p) => !p.deleted).length;
  const wm: WatermarkSettings = { ...defaultWatermark(), ...watermark };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add watermark"
      width={620}
      footer={
        <>
          <Button variant="ghost" onClick={() => setWatermark(defaultWatermark())}>
            Reset
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setWatermark({ ...wm, enabled: true });
              useUI.getState().toast('success', 'Watermark will be drawn on export.');
              onClose();
            }}
          >
            Apply watermark
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-4">
          <Section title="Content">
            <Field label="Text">
              <Input value={wm.text} onChange={(e) => setWatermark({ text: e.target.value })} />
            </Field>
            <Field label="Font">
              <Select
                value={wm.fontFamily ?? 'Helvetica'}
                onChange={(fontFamily) => setWatermark({ fontFamily })}
                options={TEXT_FONTS.map((f) => ({ value: f.id, label: f.label }))}
              />
            </Field>
            <div className="flex gap-3">
              <Toggle label="Bold" checked={!!wm.bold} onChange={(bold) => setWatermark({ bold })} />
              <Toggle label="Italic" checked={!!wm.italic} onChange={(italic) => setWatermark({ italic })} />
            </div>
          </Section>
          <Section title="Appearance">
            <Slider label="Size" min={8} max={200} step={1} value={wm.fontSize} onChange={(fontSize) => setWatermark({ fontSize })} suffix=" pt" />
            <Slider label="Opacity" min={0.02} max={1} step={0.02} value={wm.opacity} onChange={(opacity) => setWatermark({ opacity })} />
            <Slider label="Rotation" min={-90} max={90} step={1} value={wm.rotation} onChange={(rotation) => setWatermark({ rotation })} suffix="°" />
            <Field label="Colour">
              <Input type="color" value={wm.color} onChange={(e) => setWatermark({ color: e.target.value })} className="h-8 w-20" />
            </Field>
            <Toggle label="Tile across the page" checked={wm.tile} onChange={(tile) => setWatermark({ tile })} />
          </Section>
          <PageScope
            value={wm.pages === 'all' ? 'all' : wm.pages.length === 1 && wm.pages[0] === currentPage ? 'current' : 'custom'}
            range={wm.pages === 'all' ? '' : wm.pages.map((i) => i + 1).join(', ')}
            currentPage={currentPage}
            total={total}
            onChange={(value, range) => {
              if (value === 'all') setWatermark({ pages: 'all' });
              else if (value === 'current') setWatermark({ pages: [currentPage] });
              else
                setWatermark({
                  pages: (range ?? '')
                    .split(',')
                    .flatMap((chunk) => {
                      const [a, b] = chunk.split('-').map((n) => Number(n.trim()));
                      if (!Number.isFinite(a)) return [];
                      const start = Math.max(0, a - 1);
                      const end = Number.isFinite(b) ? b : a;
                      return Array.from({ length: Math.max(1, end - start) }, (_, k) => start + k);
                    })
                    .filter((i) => i >= 0 && i < total),
                });
            }}
          />
        </div>
        <div>
          <Section title="Preview">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md border border-ink-700 bg-white">
              {wm.tile ? (
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-5">
                  {Array.from({ length: 15 }).map((_, i) => (
                    <span
                      key={i}
                      className="flex items-center justify-center text-center font-bold"
                      style={{
                        color: wm.color,
                        opacity: wm.opacity,
                        transform: `rotate(${-wm.rotation}deg)`,
                        fontSize: Math.max(6, wm.fontSize / 4),
                      }}
                    >
                      {wm.text}
                    </span>
                  ))}
                </div>
              ) : (
                <span
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-bold"
                  style={{
                    color: wm.color,
                    opacity: wm.opacity,
                    transform: `translate(-50%, -50%) rotate(${-wm.rotation}deg)`,
                    fontSize: wm.fontSize / 2.4,
                  }}
                >
                  {wm.text}
                </span>
              )}
            </div>
          </Section>
        </div>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Header & footer                                                     */
/* ------------------------------------------------------------------ */

const Macro = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-ink-800 px-1 py-0.5 text-2xs text-accent">{children}</code>
);

export const HeaderFooterDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const headerFooter = useDoc((s) => s.headerFooter);
  const setHeaderFooter = useDoc((s) => s.setHeaderFooter);
  const total = useDoc((s) => s.pages).filter((p) => !p.deleted).length;
  const hf: HeaderFooterSettings = { ...defaultHeaderFooter(), ...headerFooter };

  const row = (key: 'header' | 'footer', label: string) => (
    <div className="space-y-1.5">
      <p className="text-2xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {(['left', 'center', 'right'] as const).map((slot) => (
          <Input
            key={slot}
            value={hf[key][slot]}
            placeholder={slot}
            onChange={(e) => setHeaderFooter({ [key]: { ...hf[key], [slot]: e.target.value } } as Partial<HeaderFooterSettings>)}
            className="h-7 text-2xs"
          />
        ))}
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Header & footer"
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={() => setHeaderFooter(defaultHeaderFooter())}>
            Reset
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setHeaderFooter({ ...hf, enabled: true });
              useUI.getState().toast('success', 'Header/footer will be drawn on export.');
              onClose();
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {row('header', 'Header')}
        {row('footer', 'Footer')}
        <p className="text-2xs leading-4 text-ink-400">
          Macros: <Macro>{'{page}'}</Macro> current page, <Macro>{'{pages}'}</Macro> total pages, <Macro>{'{date}'}</Macro>{' '}
          today, <Macro>{'{title}'}</Macro> document title, <Macro>{'{filename}'}</Macro> file name, <Macro>{'{bates}'}</Macro>{' '}
          bates number.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Font size">
            <Select
              value={String(hf.fontSize)}
              onChange={(v) => setHeaderFooter({ fontSize: Number(v) })}
              options={BODY_FONT_SIZES.map((s) => ({ value: String(s), label: `${s} pt` }))}
            />
          </Field>
          <Field label="Colour">
            <Input type="color" value={hf.color} onChange={(e) => setHeaderFooter({ color: e.target.value })} className="h-8" />
          </Field>
          <Field label="Margin">
            <Input
              type="number"
              value={hf.margin}
              onChange={(e) => setHeaderFooter({ margin: Number(e.target.value) })}
              className="h-8"
            />
          </Field>
        </div>
        <Toggle
          label="Different first page"
          hint={`Skip the header and footer on page 1 of ${total}.`}
          checked={hf.firstPageDifferent}
          onChange={(firstPageDifferent) => setHeaderFooter({ firstPageDifferent })}
        />
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Page numbers & Bates                                                */
/* ------------------------------------------------------------------ */

const POSITIONS = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top centre' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom centre' },
  { value: 'bottom-right', label: 'Bottom right' },
];

export const PageNumbersDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const settings = useDoc((s) => s.pageNumbers);
  const setPageNumbers = useDoc((s) => s.setPageNumbers);
  const pn: PageNumberSettings = { ...defaultPageNumbers(), ...settings };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Page numbers"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            onClick={() => {
              setPageNumbers({ ...pn, enabled: true });
              useUI.getState().toast('success', 'Page numbers will be added on export.');
              onClose();
            }}
          >
            Add page numbers
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Position">
          <Select
            value={pn.position}
            onChange={(position) => setPageNumbers({ position: position as PageNumberSettings['position'] })}
            options={POSITIONS}
          />
        </Field>
        <Field label="Start at">
          <Input type="number" min={1} value={pn.startAt} onChange={(e) => setPageNumbers({ startAt: Number(e.target.value) })} className="h-8" />
        </Field>
        <Field label="Prefix">
          <Input value={pn.prefix} onChange={(e) => setPageNumbers({ prefix: e.target.value })} className="h-8" />
        </Field>
        <Field label="Suffix">
          <Input value={pn.suffix} onChange={(e) => setPageNumbers({ suffix: e.target.value })} className="h-8" />
        </Field>
        <Field label="Font size">
          <Select
            value={String(pn.fontSize)}
            onChange={(v) => setPageNumbers({ fontSize: Number(v) })}
            options={BODY_FONT_SIZES.map((s) => ({ value: String(s), label: `${s} pt` }))}
          />
        </Field>
        <Field label="Colour">
          <Input type="color" value={pn.color} onChange={(e) => setPageNumbers({ color: e.target.value })} className="h-8" />
        </Field>
      </div>
      <p className="mt-3 rounded-md border border-ink-700 bg-ink-800/50 p-2 text-center text-base text-ink-200">
        Preview: <span className="font-medium">{pn.prefix}{pn.startAt}{pn.suffix || ` / ${useDoc.getState().pages.filter((p) => !p.deleted).length}`}</span>
      </p>
    </Modal>
  );
};

export const BatesDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const settings = useDoc((s) => s.bates);
  const setBates = useDoc((s) => s.setBates);
  const bates: BatesSettings = { ...defaultBates(), ...settings };
  const preview = `${bates.prefix}${String(bates.startAt).padStart(bates.digits, '0')}${bates.suffix}`;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bates numbering"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            onClick={() => {
              setBates({ ...bates, enabled: true });
              useUI.getState().toast('success', 'Bates numbers will be stamped on export.');
              onClose();
            }}
          >
            Apply numbering
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Prefix">
          <Input value={bates.prefix} onChange={(e) => setBates({ prefix: e.target.value })} className="h-8" />
        </Field>
        <Field label="Suffix">
          <Input value={bates.suffix} onChange={(e) => setBates({ suffix: e.target.value })} className="h-8" />
        </Field>
        <Field label="Start at">
          <Input type="number" value={bates.startAt} onChange={(e) => setBates({ startAt: Number(e.target.value) })} className="h-8" />
        </Field>
        <Field label="Digits">
          <Select
            value={String(bates.digits)}
            onChange={(v) => setBates({ digits: Number(v) })}
            options={[4, 5, 6, 7, 8, 10].map((d) => ({ value: String(d), label: String(d) }))}
          />
        </Field>
        <Field label="Position">
          <Select
            value={bates.position}
            onChange={(position) => setBates({ position: position as BatesSettings['position'] })}
            options={POSITIONS}
          />
        </Field>
        <Field label="Font size">
          <Select
            value={String(bates.fontSize)}
            onChange={(v) => setBates({ fontSize: Number(v) })}
            options={BODY_FONT_SIZES.map((s) => ({ value: String(s), label: `${s} pt` }))}
          />
        </Field>
        <Field label="Colour">
          <Input type="color" value={bates.color} onChange={(e) => setBates({ color: e.target.value })} className="h-8" />
        </Field>
        <Field label="Margin">
          <Input type="number" value={bates.margin} onChange={(e) => setBates({ margin: Number(e.target.value) })} className="h-8" />
        </Field>
      </div>
      <p className="mt-3 rounded-md border border-ink-700 bg-ink-800/50 p-2 font-mono text-base text-ink-200">Preview: {preview}</p>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Metadata                                                            */
/* ------------------------------------------------------------------ */

export const MetadataDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const meta = useDoc((s) => s.meta);
  const setMeta = useDoc((s) => s.setMeta);
  const security = useDoc((s) => s.security);
  const pages = useDoc((s) => s.pages).filter((p) => !p.deleted);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Document properties"
      width={560}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title">
            <Input value={meta.title} onChange={(e) => setMeta({ title: e.target.value })} />
          </Field>
          <Field label="Author">
            <Input value={meta.author} onChange={(e) => setMeta({ author: e.target.value })} />
          </Field>
          <Field label="Subject">
            <Input value={meta.subject} onChange={(e) => setMeta({ subject: e.target.value })} />
          </Field>
          <Field label="Keywords">
            <Input value={meta.keywords} placeholder="comma, separated" onChange={(e) => setMeta({ keywords: e.target.value })} />
          </Field>
          <Field label="Creator">
            <Input value={meta.creator} onChange={(e) => setMeta({ creator: e.target.value })} />
          </Field>
          <Field label="Producer">
            <Input value={meta.producer} onChange={(e) => setMeta({ producer: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-md border border-ink-700 bg-ink-800/40 p-2 text-2xs text-ink-300">
          <span>Pages: {pages.length}</span>
          <span>Encryption: {security.enabled ? security.algorithm : 'none'}</span>
          <span>Accessibility: {meta.title ? 'title set' : 'title missing'}</span>
        </div>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Compress                                                            */
/* ------------------------------------------------------------------ */

export const CompressDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const pages = useDoc((s) => s.pages).filter((p) => !p.deleted);
  const sources = useDoc((s) => s.sources);
  const [quality, setQuality] = useState(78);
  const [scale, setScale] = useState(1.5);
  const [grayscale, setGrayscale] = useState(false);
  const [busy, setBusy] = useState(false);
  const sourceBytes = Object.values(sources).reduce((sum, s) => sum + (s.bytes?.byteLength ?? 0), 0);
  const estimate = Math.max(0.05, (scale / 2) ** 2 * (quality / 90) * (grayscale ? 0.75 : 1)) * sourceBytes;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compress & optimise"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            icon={Sparkles}
            disabled={busy || !pages.length}
            onClick={async () => {
              setBusy(true);
              try {
                await runExport({ ...defaultExportOptions(), format: 'pdf-flat', quality, scale });
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Compressing…' : 'Compress PDF'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-base text-ink-300">
          Re-renders every page at the chosen resolution and re-embeds the images. Text stays selectable and searchable.
        </p>
        <Slider label="Image quality" min={30} max={100} step={1} value={quality} onChange={setQuality} suffix="%" />
        <Slider label="Resolution scale" min={0.5} max={3} step={0.25} value={scale} onChange={setScale} suffix="×" />
        <Toggle label="Convert to grayscale" checked={grayscale} onChange={setGrayscale} />
        <div className="rounded-md border border-ink-700 bg-ink-800/40 p-3 text-2xs text-ink-300">
          <div className="flex items-center justify-between">
            <span>Original sources</span>
            <span className="tabular-nums">{formatBytes(sourceBytes)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>Estimated result</span>
            <span className="tabular-nums text-accent">≈ {formatBytes(estimate)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Split                                                               */
/* ------------------------------------------------------------------ */

export const SplitDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const pages = useDoc((s) => s.pages).filter((p) => !p.deleted);
  const docName = useDoc((s) => s.docName);
  const [mode, setMode] = useState<'every' | 'ranges' | 'single'>('every');
  const [every, setEvery] = useState(1);
  const [ranges, setRanges] = useState('1-2, 3-4');
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    if (mode === 'single') return pages.map((_, index) => [index]);
    if (mode === 'every') {
      const out: number[][] = [];
      for (let i = 0; i < pages.length; i += Math.max(1, every)) {
        out.push(Array.from({ length: Math.min(every, pages.length - i) }, (_, k) => i + k));
      }
      return out;
    }
    return ranges
      .split(',')
      .map((chunk) => {
        const [a, b] = chunk.split('-').map((n) => Number(n.trim()));
        const start = Math.max(1, Number.isFinite(a) ? a : 1) - 1;
        const end = Math.max(start + 1, Number.isFinite(b) ? b : start + 1);
        return Array.from({ length: end - start }, (_, k) => start + k).filter((i) => i >= 0 && i < pages.length);
      })
      .filter((group) => group.length);
  }, [mode, every, ranges, pages]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Split document"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            icon={FileDown}
            disabled={busy || !groups.length}
            onClick={async () => {
              setBusy(true);
              try {
                await saveSplit(groups);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Splitting…' : `Export ${groups.length} file(s)`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Split mode">
          <Select
            value={mode}
            onChange={(v) => setMode(v as typeof mode)}
            options={[
              { value: 'every', label: 'Every N pages' },
              { value: 'ranges', label: 'Custom ranges' },
              { value: 'single', label: 'One file per page' },
            ]}
          />
        </Field>
        {mode === 'every' ? (
          <Field label="Pages per file">
            <Input type="number" min={1} max={Math.max(1, pages.length)} value={every} onChange={(e) => setEvery(Number(e.target.value))} className="h-8" />
          </Field>
        ) : null}
        {mode === 'ranges' ? (
          <Field label="Ranges" hint="Comma separated, e.g. 1-3, 4, 5-8">
            <Input value={ranges} onChange={(e) => setRanges(e.target.value)} className="h-8" />
          </Field>
        ) : null}
        <div className="rounded-md border border-ink-700 bg-ink-800/40 p-2 text-2xs text-ink-300">
          <p>
            {groups.length} file(s) from {pages.length} page(s). Files are named{' '}
            <span className="font-mono text-ink-100">{sanitizeFilename(docName)}-part-1.pdf</span> and download as a ZIP.
          </p>
        </div>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Security                                                            */
/* ------------------------------------------------------------------ */

const PERMISSIONS = [
  ['allowPrinting', 'Printing'] as const,
  ['allowCopying', 'Copy text & images'] as const,
  ['allowModifying', 'Modify the document'] as const,
  ['allowAnnotating', 'Comment & annotate'] as const,
  ['allowForms', 'Fill form fields'] as const,
  ['allowAccessibility', 'Screen-reader access'] as const,
  ['allowAssembly', 'Insert, rotate or delete pages'] as const,
];

export const SecurityDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const security = useDoc((s) => s.security);
  const setSecurity = useDoc((s) => s.setSecurity);
  const [confirm, setConfirm] = useState('');
  const strength = passwordStrength(security.userPassword);
  const mismatch = !!security.userPassword && confirm !== security.userPassword;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Password & permissions"
      width={620}
      footer={
        <>
          <Button variant="ghost" onClick={() => setSecurity({ enabled: false, userPassword: '', ownerPassword: '' })}>
            Remove protection
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={Lock}
            disabled={mismatch}
            onClick={() => {
              setSecurity({ enabled: true });
              useUI.getState().toast('success', 'Encryption will be applied when you export.');
              onClose();
            }}
          >
            Protect document
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-4">
          <Section title="Passwords" hint="Applied with AES-256 when the PDF is saved.">
            <Field label="User password" hint="Required to open the document">
              <Input
                type="password"
                value={security.userPassword}
                autoComplete="new-password"
                onChange={(e) => setSecurity({ userPassword: e.target.value })}
              />
            </Field>
            <Field label="Confirm password">
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
            {security.userPassword ? (
              <div className="space-y-1">
                <ProgressBar value={(strength.score / 4) * 100} />
                <p className="text-2xs text-ink-400">
                  {strength.label}
                  {strength.suggestions[0] ? ` — ${strength.suggestions[0]}` : ''}
                </p>
              </div>
            ) : null}
            <Field label="Owner password" hint="Optional; defaults to the user password. Required to change permissions.">
              <Input
                type="password"
                value={security.ownerPassword}
                autoComplete="new-password"
                onChange={(e) => setSecurity({ ownerPassword: e.target.value })}
              />
            </Field>
            <Field label="Algorithm">
              <Select
                value={security.algorithm}
                onChange={(v) => setSecurity({ algorithm: v as typeof security.algorithm })}
                options={[
                  { value: 'AES-256', label: 'AES-256 (recommended)' },
                  { value: 'AES-128', label: 'AES-128' },
                  { value: 'RC4-128', label: 'RC4 128-bit (legacy)' },
                  { value: 'RC4-40', label: 'RC4 40-bit (insecure)' },
                ]}
              />
            </Field>
          </Section>
        </div>
        <div className="space-y-3">
          <Section title="Permissions" hint="Only meaningful when a password is set.">
            <div className="space-y-2">
              {PERMISSIONS.map(([key, label]) =>
                key === 'allowPrinting' ? (
                  <Field key={key} label="Printing">
                    <Select
                      value={security.allowPrinting}
                      onChange={(v) => setSecurity({ allowPrinting: v as typeof security.allowPrinting })}
                      options={[
                        { value: 'all', label: 'Allow high resolution' },
                        { value: 'lowResolution', label: 'Allow low resolution' },
                        { value: 'none', label: 'Block printing' },
                      ]}
                    />
                  </Field>
                ) : (
                  <Toggle
                    key={key}
                    label={label}
                    checked={security[key] as boolean}
                    onChange={(value) => setSecurity({ [key]: value } as never)}
                  />
                ),
              )}
            </div>
          </Section>
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-2xs leading-4 text-amber-200">
            Passwords are never stored or uploaded. If you lose the password the document cannot be recovered.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export const Check = ShieldCheck;

/* ------------------------------------------------------------------ */
/* OCR                                                                 */
/* ------------------------------------------------------------------ */

export const OcrDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const pages = useDoc((s) => s.pages).filter((p) => !p.deleted);
  const currentPage = useUI((s) => s.currentPage);
  const busy = useUI((s) => s.busy);
  const [langs, setLangs] = useState<string[]>(['eng']);
  const [scope, setScope] = useState<'all' | 'current' | 'custom'>('all');
  const [range, setRange] = useState('1-3');
  const [scale, setScale] = useState(2.4);
  const [busyLocal, setBusyLocal] = useState(false);

  const targets = useMemo(() => {
    if (scope === 'current') return [pages[currentPage]].filter(Boolean).map((p) => p.id);
    if (scope === 'custom') {
      const ids: string[] = [];
      for (const chunk of range.split(',')) {
        const [a, b] = chunk.split('-').map((n) => Number(n.trim()));
        const start = Math.max(1, Number.isFinite(a) ? a : 1) - 1;
        const end = Math.max(start + 1, Number.isFinite(b) ? b : start + 1);
        for (let i = start; i < end && i < pages.length; i += 1) ids.push(pages[i].id);
      }
      return ids;
    }
    return [];
  }, [scope, range, pages, currentPage]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Recognise text (OCR)"
      width={620}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            icon={ScanText}
            disabled={busyLocal || !pages.length}
            onClick={async () => {
              setBusyLocal(true);
              try {
                await runOcr(targets, langs.join('+') || 'eng', scale);
                onClose();
              } finally {
                setBusyLocal(false);
              }
            }}
          >
            {busyLocal ? 'Recognising…' : 'Start OCR'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_220px] gap-5">
        <div className="space-y-3">
          <Section title="Languages" hint="Hold Ctrl/Cmd to pick several. Fewer languages recognise faster.">
            <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-ink-700 p-1.5">
              {OCR_LANGUAGES.map((lang) => (
                <label key={lang.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-base text-ink-200 hover:bg-ink-800">
                  <input
                    type="checkbox"
                    checked={langs.includes(lang.id)}
                    onChange={(e) =>
                      setLangs((prev) => (e.target.checked ? [...prev, lang.id] : prev.filter((l) => l !== lang.id)))
                    }
                  />
                  <span className="flex-1">{lang.label}</span>
                  <span className="font-mono text-2xs text-ink-500">{lang.id}</span>
                </label>
              ))}
            </div>
          </Section>
        </div>
        <div className="space-y-4">
          <PageScope value={scope} range={range} currentPage={currentPage} total={pages.length} onChange={(v, r) => { setScope(v); if (r !== undefined) setRange(r); }} />
          <Slider label="Render scale" min={1} max={4} step={0.2} value={scale} onChange={setScale} suffix="×" />
          <div className="rounded-md border border-ink-700 bg-ink-800/40 p-2 text-2xs leading-4 text-ink-400">
            <p>{scope === 'all' ? pages.length : targets.length} page(s) will be processed.</p>
            <p className="mt-1">Language data is cached locally, so recognition can work offline after the first download.</p>
          </div>
          {busy.active ? (
            <div className="space-y-1">
              <ProgressBar value={busy.progress} />
              <p className="text-2xs text-ink-400">{busy.label}</p>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Sign — draw or type a signature                                     */
/* ------------------------------------------------------------------ */

export const SignDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typed, setTyped] = useState('');
  const [font, setFont] = useState('Helvetica');
  const [color, setColor] = useState('#101827');
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  const prepare = (canvas: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 560 * dpr;
    canvas.height = 180 * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    return ctx;
  };

  useEffect(() => {
    if (!open || mode !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = prepare(canvas);
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
    // Re-initialises the canvas whenever the dialog opens or the mode changes.
  }, [open, mode]);

  const place = async () => {
    const ui = useUI.getState();
    if (mode === 'type') {
      if (!typed.trim()) return;
      const canvas = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = 900 * dpr;
      canvas.height = 260 * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = color;
      ctx.font = `52px ${font === 'Times-Roman' ? 'Georgia, serif' : font === 'Courier' ? 'ui-monospace, monospace' : 'ui-sans-serif, system-ui, sans-serif'}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(typed, 24, 130);
      const asset = await assetFromCanvas(canvas, 'signature-typed.png');
      useDoc.getState().addAsset(asset);
      useUI.getState().setPreviewStamp({
        id: uid('sig'),
        pageId: '',
        kind: 'signature',
        x: 0,
        y: 0,
        w: 180,
        h: 52,
        rotation: 0,
        opacity: 1,
        assetId: asset.id,
        text: typed,
        signer: typed,
        rule: false,
        style: { fontFamily: font, fontSize: 26, color },
      });
    } else {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const asset = await assetFromCanvas(canvas, 'signature-drawn.png');
      useDoc.getState().addAsset(asset);
      useUI.getState().setPreviewStamp({
        id: uid('sig'),
        pageId: '',
        kind: 'signature',
        x: 0,
        y: 0,
        w: 180,
        h: 58,
        rotation: 0,
        opacity: 1,
        assetId: asset.id,
        rule: true,
        signer: useDoc.getState().meta.author,
      });
    }
    useUI.getState().setTool('signature');
    ui.toast('info', 'Click on the page to place your signature.');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fill & sign"
      width={620}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <Button variant="primary" icon={Signature} onClick={() => void place()} disabled={mode === 'draw' ? !dirty : !typed.trim()}>
            Place signature
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-1 rounded-md border border-ink-700 p-0.5">
          {(
            [
              ['draw', 'Draw', Pen],
              ['type', 'Type', Type],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-base ${
                mode === value ? 'bg-ink-700 text-white' : 'text-ink-300 hover:bg-ink-800'
              }`}
            >
              <Icon size={13} strokeWidth={1.75} /> {label}
            </button>
          ))}
        </div>

        {mode === 'draw' ? (
          <div className="rounded-lg border border-dashed border-ink-600 bg-white">
            <canvas
              ref={canvasRef}
              className="h-[180px] w-full touch-none"
              onPointerDown={(e) => {
                const ctx = canvasRef.current?.getContext('2d');
                if (!ctx) return;
                drawing.current = true;
                canvasRef.current?.setPointerCapture(e.pointerId);
                const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                const ctx = canvasRef.current?.getContext('2d');
                if (!ctx) return;
                const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
                ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                ctx.stroke();
                setDirty(true);
              }}
              onPointerUp={() => {
                drawing.current = false;
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Your name">
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Jane Doe" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Style">
                <Select
                  value={font}
                  onChange={setFont}
                  options={TEXT_FONTS.map((f) => ({ value: f.id, label: f.label }))}
                />
              </Field>
              <Field label="Colour">
                <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-20" />
              </Field>
            </div>
            <div
              className="grid h-24 place-items-center rounded-lg border border-ink-700 bg-white text-4xl"
              style={{
                color,
                fontFamily: font === 'Times-Roman' ? 'Georgia, serif' : font === 'Courier' ? 'ui-monospace, monospace' : 'ui-sans-serif, system-ui',
              }}
            >
              {typed || 'Jane Doe'}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <span className="text-2xs text-ink-400">Ink colour</span>
          <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-14" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const canvas = canvasRef.current;
              const ctx = canvas?.getContext('2d');
              if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
              setDirty(false);
            }}
          >
            <Trash2 size={12} strokeWidth={1.75} /> Clear
          </Button>
        </div>
        <p className="text-2xs leading-4 text-ink-500">
          Your signature is stored locally (and inside the project file if you save one). It is never uploaded.
        </p>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Digital signature (PKCS#12)                                         */
/* ------------------------------------------------------------------ */

export const DigitalSignDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [p12, setP12] = useState<Uint8Array | null>(null);
  const [name, setName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [info, setInfo] = useState<SignatureInfo | null>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('Approved');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);

  const inspect = async (bytes: Uint8Array, pass: string) => {
    setError('');
    try {
      const result = await inspectP12(bytes, pass);
      setInfo(result);
      setName((current) => current || result.subject);
    } catch (err) {
      setInfo(null);
      setError(err instanceof Error ? err.message : 'The certificate could not be read.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Digital signature"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            icon={ShieldCheck}
            disabled={!info || busy}
            onClick={async () => {
              if (!p12 || !info) return;
              setBusy(true);
              try {
                const input = { ...buildInputFromStore(), options: { ...buildInputFromStore().options } };
                const result = await buildPdf(input);
                const signed = await signPdf(result.bytes, { p12, passphrase }, {
                  name: info.subject || name,
                  reason,
                  location,
                  signingTime: new Date(),
                  widgetRect: { x: 36, y: 36, w: 180, h: 60 },
                });
                const filename = `${sanitizeFilename(useDoc.getState().docName)}-signed.pdf`;
                offerDownload(new Blob([signed.slice().buffer as ArrayBuffer], { type: 'application/pdf' }), filename);
                useUI.getState().toast('success', `${filename} is signed and ready. Click Download.`);
                onClose();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Signing failed.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Signing…' : 'Sign & download'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Section title="Certificate" hint="A .p12 / .pfx file from your certificate authority or Windows/macOS keystore export.">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600 px-4 py-6 text-base text-ink-300 hover:border-accent/60 hover:text-white">
            <ShieldCheck size={16} strokeWidth={1.75} />
            {p12 ? `${p12.byteLength} bytes loaded` : 'Choose a .p12 or .pfx file'}
            <input
              type="file"
              accept=".p12,.pfx,application/x-pkcs12"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const bytes = new Uint8Array(await file.arrayBuffer());
                setP12(bytes);
                if (passphrase) void inspect(bytes, passphrase);
              }}
            />
          </label>
          <Field label="Passphrase">
            <Input
              type="password"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                if (p12) void inspect(p12, e.target.value);
              }}
            />
          </Field>
        </Section>

        {info ? (
          <div className="space-y-1 rounded-md border border-emerald-600/40 bg-emerald-500/5 p-2 text-2xs text-emerald-100">
            <p className="font-medium">{info.subject}</p>
            <p>Issuer: {info.issuer}</p>
            {info.validFrom ? <p>Valid: {new Date(info.validFrom).toLocaleDateString()} → {info.validTo ? new Date(info.validTo).toLocaleDateString() : '—'}</p> : null}
          </div>
        ) : null}
        {error ? <p className="rounded-md border border-red-500/40 bg-red-500/5 p-2 text-2xs text-red-200">{error}</p> : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" />
          </Field>
        </div>
        <p className="text-2xs leading-4 text-ink-500">
          The signature is applied to the exported bytes with a detached PKCS#7 (PAdES) signature and SHA-256 digest.
        </p>
      </div>
    </Modal>
  );
};

export const OVERLAY_STAMPS = STAMPS;
export { FileDown, Badge };
