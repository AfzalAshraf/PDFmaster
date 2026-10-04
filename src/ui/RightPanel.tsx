import React, { useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignHorizontalSpaceAround,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronsDown,
  ChevronsUp,
  Copy,
  CornerDownRight,
  FileDown,
  FileText,
  Gauge,
  Layers,
  Lock,
  Unlock,
  MessageSquare,
  Plus,
  RotateCw,
  ScanText,
  Shield,
  Signature,
  Sparkles,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { useDoc } from '../state/store';
import { useUI } from '../state/ui';
import {
  Badge,
  Button,
  ColorSwatch,
  EmptyState,
  Field,
  IconButton,
  Input,
  SectionTitle,
  Select,
  Slider,
  Textarea,
  Toggle,
} from './primitives';
import { BODY_FONT_SIZES, COLOR_PALETTE, HIGHLIGHT_COLORS, STAMPS, TEXT_FONTS } from '../core/constants';
import type { AnyObject, FormFieldObject, PageId } from '../core/types';
import { planOcrReplacements, sampleWordBackground } from '../core/ocr';
import { sanitizeFilename, uid } from '../core/utils';
import { defaultExportOptions, runExport, saveSplit } from './actions';
import { assetFromFile } from '../core/assets';

export const RightPanel: React.FC = () => {
  const panel = useUI((s) => s.rightPanel);
  const setRightPanel = useUI((s) => s.setRightPanel);
  if (panel === 'none') return null;

  const titles: Record<Exclude<typeof panel, 'none'>, string> = {
    tools: 'Quick tools',
    properties: 'Properties',
    security: 'Protect',
    export: 'Export',
    forms: 'Form fields',
    ocr: 'Recognise text',
    organize: 'Organise pages',
    metadata: 'Document properties',
    sign: 'Fill & sign',
    branding: 'Branding',
    compress: 'Optimise',
  };

  return (
    <aside className="pm-no-print flex w-[300px] shrink-0 flex-col border-l border-ink-700 bg-ink-850" data-testid="right-panel">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-ink-700 pl-3 pr-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-300">{titles[panel]}</span>
        <IconButton icon={X} label="Close panel" onClick={() => setRightPanel(panel)} />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {panel === 'tools' ? <QuickTools /> : null}
        {panel === 'properties' ? <PropertiesPanel /> : null}
        {panel === 'organize' ? <OrganizePanel /> : null}
        {panel === 'forms' ? <FormsPanel /> : null}
        {panel === 'security' ? <SecurityPanel /> : null}
        {panel === 'export' ? <ExportPanel /> : null}
        {panel === 'metadata' ? <MetadataPanel /> : null}
        {panel === 'sign' ? <SignPanel /> : null}
        {panel === 'ocr' ? <OcrPanel /> : null}
        {panel === 'compress' ? <CompressPanel /> : null}
      </div>
    </aside>
  );
};

/* ------------------------------------------------------------------ */
/* Quick tools                                                         */
/* ------------------------------------------------------------------ */

const QuickTools: React.FC = () => {
  const openDialog = useUI((s) => s.openDialog);
  const setRightPanel = useUI((s) => s.setRightPanel);
  const setTool = useUI((s) => s.setTool);
  const pages = useDoc((s) => s.pages).filter((p) => !p.deleted);
  const items: {
    label: string;
    hint: string;
    icon: React.ComponentType<{ size?: number | string; className?: string; strokeWidth?: number }>;
    run: () => void;
  }[] = [
    { label: 'Edit text & images', hint: 'Rewrite existing PDF text', icon: Type, run: () => setTool('editText') },
    { label: 'Add text', hint: 'Place a new text box', icon: Type, run: () => setTool('text') },
    { label: 'Insert image', hint: 'Place a picture on the page', icon: Layers, run: () => setTool('image') },
    { label: 'Comment', hint: 'Highlight, sticky notes, markup', icon: MessageSquare, run: () => setTool('highlight') },
    { label: 'Sign yourself', hint: 'Draw or type a signature', icon: Signature, run: () => openDialog('sign') },
    { label: 'Fill & sign', hint: 'Complete form fields', icon: CornerDownRight, run: () => setRightPanel('sign') },
    { label: 'Organise pages', hint: 'Reorder, rotate, delete, extract', icon: Layers, run: () => setRightPanel('organize') },
    { label: 'Compress', hint: 'Shrink the file for sharing', icon: Gauge, run: () => openDialog('compress') },
    { label: 'Recognise text', hint: 'OCR scanned pages', icon: ScanText, run: () => openDialog('ocr') },
    { label: 'Protect', hint: 'Passwords, permissions, redaction', icon: Shield, run: () => openDialog('security') },
    { label: 'Export', hint: 'PDF, images, Office, text', icon: FileDown, run: () => openDialog('export') },
    { label: 'Document properties', hint: 'Title, author, subject', icon: FileText, run: () => openDialog('metadata') },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.run}
            className="pm-focus-ring flex flex-col gap-1 rounded-lg border border-ink-700 bg-ink-800/70 p-2.5 text-left transition-colors hover:border-accent/50 hover:bg-ink-800"
          >
            <item.icon size={16} strokeWidth={1.75} className="text-accent" />
            <span className="text-base font-medium leading-4 text-ink-100">{item.label}</span>
            <span className="text-2xs leading-3 text-ink-500">{item.hint}</span>
          </button>
        ))}
      </div>
      <p className="rounded-md border border-ink-700 bg-ink-800/40 p-2 text-2xs leading-4 text-ink-400">
        {pages.length} page(s) in this document. Everything runs locally — your files are never uploaded.
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Properties                                                          */
/* ------------------------------------------------------------------ */

const PropertiesPanel: React.FC = () => {
  const selection = useUI((s) => s.selection);
  const objects = useDoc((s) => s.objects);
  const pages = useDoc((s) => s.pages);
  const currentPage = useUI((s) => s.currentPage);
  const page = pages.filter((p) => !p.deleted)[currentPage];
  const selected = selection.map((id) => objects[id]).filter(Boolean);
  const update = (id: string, patch: Partial<AnyObject>) => useDoc.getState().updateObject(id, patch);

  if (!page) return <EmptyState icon={FileText} title="No document open" hint="Open a PDF to edit its properties." />;

  return (
    <div className="space-y-4">
      {selected.length === 1 ? (
        <ObjectProperties object={selected[0]} onChange={(patch) => update(selected[0].id, patch)} />
      ) : selected.length > 1 ? (
        <MultiSelection />
      ) : (
        <PageProperties pageId={page.id} />
      )}
    </div>
  );
};

const MultiSelection: React.FC = () => {
  const selection = useUI((s) => s.selection);
  const objects = useDoc((s) => s.objects);
  const apply = (patch: Partial<AnyObject>) => {
    const patches = selection.map((id) => {
      const object = objects[id];
      if (!object) return { id, patch };
      return { id, patch: { ...patch } as Partial<AnyObject> };
    });
    useDoc.getState().updateObjects(patches);
  };
  return (
    <div className="space-y-3">
      <SectionTitle>{selection.length} objects selected</SectionTitle>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" onClick={() => useDoc.getState().reorderObject(selection[0], 'front')}>
          <ArrowUpToLine size={12} strokeWidth={1.75} /> To front
        </Button>
        <Button size="sm" variant="ghost" onClick={() => useDoc.getState().reorderObject(selection[0], 'back')}>
          <ArrowDownToLine size={12} strokeWidth={1.75} /> To back
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const copies = selection
              .map((id) => objects[id])
              .filter(Boolean)
              .map((o) => ({ ...structuredClone(o), id: uid('obj'), x: o.x + 12, y: o.y - 12, createdAt: Date.now() }));
            useDoc.getState().addObjects(copies);
            useUI.getState().setSelection(copies.map((c) => c.id));
          }}
        >
          <Copy size={12} strokeWidth={1.75} /> Duplicate
        </Button>
        <Button size="sm" variant="danger" onClick={() => {
          useDoc.getState().removeObjects(selection);
          useUI.getState().clearSelection();
        }}>
          <Trash2 size={12} strokeWidth={1.75} /> Delete
        </Button>
      </div>
      <Slider label="Opacity" min={0} max={1} step={0.05} value={objects[selection[0]]?.opacity ?? 1} onChange={(v) => apply({ opacity: v })} />
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const boxes = selection.map((id) => objects[id]).filter(Boolean);
            const left = Math.min(...boxes.map((b) => b.x));
            useDoc.getState().updateObjects(selection.map((id) => ({ id, patch: { x: left } })));
          }}
        >
          Align left
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const boxes = selection.map((id) => objects[id]).filter(Boolean);
            const centre = boxes.reduce((sum, b) => sum + b.x + b.w / 2, 0) / Math.max(1, boxes.length);
            useDoc.getState().updateObjects(selection.map((id) => ({ id, patch: { x: centre - objects[id].w / 2 } })));
          }}
        >
          Centre
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const boxes = selection.map((id) => objects[id]).filter(Boolean);
            const top = Math.max(...boxes.map((b) => b.y + b.h));
            useDoc.getState().updateObjects(selection.map((id) => ({ id, patch: { y: top - objects[id].h } })));
          }}
        >
          Align top
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const boxes = selection.map((id) => objects[id]).filter(Boolean);
            const bottom = Math.min(...boxes.map((b) => b.y));
            useDoc.getState().updateObjects(selection.map((id) => ({ id, patch: { y: bottom } })));
          }}
        >
          Align bottom
        </Button>
      </div>
      <Button
        size="sm"
        variant="secondary"
        full
        onClick={() => {
          const boxes = selection.map((id) => objects[id]).filter(Boolean) as AnyObject[];
          if (boxes.length < 2) return;
          const sorted = [...boxes].sort((a, b) => a.x - b.x);
          const gap = 8;
          let cursor = sorted[0].x + sorted[0].w + gap;
          const patches = sorted.slice(1).map((box) => {
            const patch = { x: cursor };
            cursor += box.w + gap;
            return { id: box.id, patch: patch as Partial<AnyObject> };
          });
          useDoc.getState().updateObjects(patches);
        }}
      >
        <AlignHorizontalSpaceAround size={12} strokeWidth={1.75} /> Distribute horizontally
      </Button>
    </div>
  );
};

const NumberField: React.FC<{ label: string; value: number; onChange: (value: number) => void; step?: number; suffix?: string }> = ({
  label,
  value,
  onChange,
  step = 1,
  suffix,
}) => (
  <Field label={label}>
    <div className="flex items-center gap-1">
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7"
      />
      {suffix ? <span className="text-2xs text-ink-500">{suffix}</span> : null}
    </div>
  </Field>
);

const ObjectProperties: React.FC<{ object: AnyObject; onChange: (patch: Partial<AnyObject>) => void }> = ({ object, onChange }) => {
  const openDialog = useUI((s) => s.openDialog);
  const kindLabel = object.kind.charAt(0).toUpperCase() + object.kind.slice(1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>{kindLabel}</SectionTitle>
        <Badge tone="neutral">{object.kind}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={object.x} onChange={(x) => onChange({ x })} suffix="pt" />
        <NumberField label="Y" value={object.y} onChange={(y) => onChange({ y })} suffix="pt" />
        <NumberField label="Width" value={object.w} onChange={(w) => onChange({ w: Math.max(4, w) })} suffix="pt" />
        <NumberField label="Height" value={object.h} onChange={(h) => onChange({ h: Math.max(4, h) })} suffix="pt" />
        <NumberField label="Rotation" value={object.rotation} onChange={(rotation) => onChange({ rotation })} step={1} suffix="°" />
        <Field label="Opacity">
          <Slider label="" min={0} max={1} step={0.05} value={object.opacity} onChange={(opacity) => onChange({ opacity })} />
        </Field>
      </div>

      {/* -------------------- kind-specific controls -------------------- */}
      {object.kind === 'highlight' || object.kind === 'underline' || object.kind === 'strike' || object.kind === 'squiggly' ? (
        <>
          <Field label="Colour">
            <ColorSwatch label="Markup colour" value={object.color} onChange={(color) => onChange({ color })} palette={HIGHLIGHT_COLORS} />
          </Field>
          {object.text ? <Field label="Marked text"><Textarea value={object.text} readOnly rows={3} /></Field> : null}
        </>
      ) : null}

      {object.kind === 'note' ? (
        <>
          <Field label="Comment">
            <Textarea value={object.text} rows={4} onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <Field label="Colour">
            <ColorSwatch label="Note colour" value={object.color} onChange={(color) => onChange({ color })} palette={COLOR_PALETTE} />
          </Field>
          <Toggle label="Popup open" checked={!!object.open} onChange={(open) => onChange({ open })} />
        </>
      ) : null}

      {object.kind === 'textbox' ? (
        <>
          <Field label="Text">
            <Textarea value={object.text} rows={4} onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Font">
              <Select
                value={object.style.fontFamily}
                onChange={(fontFamily) => onChange({ style: { ...object.style, fontFamily } })}
                options={TEXT_FONTS.map((f) => ({ value: f.id, label: f.label }))}
              />
            </Field>
            <Field label="Size">
              <Select
                value={String(object.style.fontSize)}
                onChange={(v) => onChange({ style: { ...object.style, fontSize: Number(v) } })}
                options={BODY_FONT_SIZES.map((s) => ({ value: String(s), label: `${s} pt` }))}
              />
            </Field>
          </div>
          <div className="flex items-center gap-1">
            <IconButton
              icon={AlignLeft}
              label="Align left"
              active={object.style.align === 'left'}
              onClick={() => onChange({ style: { ...object.style, align: 'left' } })}
            />
            <IconButton
              icon={AlignCenter}
              label="Align centre"
              active={object.style.align === 'center'}
              onClick={() => onChange({ style: { ...object.style, align: 'center' } })}
            />
            <IconButton
              icon={AlignRight}
              label="Align right"
              active={object.style.align === 'right'}
              onClick={() => onChange({ style: { ...object.style, align: 'right' } })}
            />
            <ColorSwatch
              label="Text colour"
              value={object.style.color}
              onChange={(color) => onChange({ style: { ...object.style, color } })}
              palette={COLOR_PALETTE}
            />
          </div>
          <div className="flex gap-2">
            <Toggle
              label="Bold"
              checked={!!object.style.bold}
              onChange={(bold) => onChange({ style: { ...object.style, bold } })}
            />
            <Toggle
              label="Italic"
              checked={!!object.style.italic}
              onChange={(italic) => onChange({ style: { ...object.style, italic } })}
            />
          </div>
        </>
      ) : null}

      {object.kind === 'shape' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Shape">
              <Select
                value={object.shape}
                onChange={(shape) => onChange({ shape: shape as typeof object.shape })}
                options={[
                  { value: 'rect', label: 'Rectangle' },
                  { value: 'ellipse', label: 'Ellipse' },
                  { value: 'line', label: 'Line' },
                  { value: 'arrow', label: 'Arrow' },
                  { value: 'polygon', label: 'Polygon' },
                  { value: 'cloud', label: 'Cloud' },
                ]}
              />
            </Field>
            <NumberField label="Stroke width" value={object.strokeWidth} onChange={(strokeWidth) => onChange({ strokeWidth })} step={0.5} suffix="pt" />
          </div>
          <Field label="Stroke">
            <ColorSwatch label="Stroke" value={object.stroke} onChange={(stroke) => onChange({ stroke })} palette={COLOR_PALETTE} />
          </Field>
          <Toggle
            label="Fill"
            checked={object.fill !== null && object.fill !== undefined}
            onChange={(on) => onChange({ fill: on ? object.stroke : null })}
          />
          {object.fill ? (
            <Field label="Fill colour">
              <ColorSwatch label="Fill" value={object.fill} onChange={(fill) => onChange({ fill })} palette={COLOR_PALETTE} />
            </Field>
          ) : null}
          <Toggle label="Dashed" checked={!!object.dashed} onChange={(dashed) => onChange({ dashed })} />
        </>
      ) : null}

      {object.kind === 'ink' ? (
        <>
          <Field label="Colour">
            <ColorSwatch label="Ink colour" value={object.color} onChange={(color) => onChange({ color })} palette={COLOR_PALETTE} />
          </Field>
          <Slider label="Stroke width" min={0.5} max={24} step={0.5} value={object.strokeWidth} onChange={(strokeWidth) => onChange({ strokeWidth })} suffix=" pt" />
          <Toggle label="Highlighter pen" checked={!!object.highlighter} onChange={(highlighter) => onChange({ highlighter })} />
        </>
      ) : null}

      {object.kind === 'stamp' ? (
        <>
          <Field label="Stamp">
            <Select
              value={STAMPS.find((s) => s.label === object.label)?.id ?? 'custom'}
              onChange={(id) => {
                const stamp = STAMPS.find((s) => s.id === id);
                if (stamp) onChange({ label: stamp.label, color: stamp.color, variant: stamp.variant });
              }}
              options={[...STAMPS.map((s) => ({ value: s.id, label: s.label })), { value: 'custom', label: object.label }]}
            />
          </Field>
          <Field label="Caption">
            <Input value={object.label} onChange={(e) => onChange({ label: e.target.value })} className="h-7" />
          </Field>
          <Field label="Detail line">
            <Input value={object.detail ?? ''} onChange={(e) => onChange({ detail: e.target.value })} className="h-7" />
          </Field>
          <Field label="Colour">
            <ColorSwatch label="Stamp colour" value={object.color} onChange={(color) => onChange({ color })} palette={COLOR_PALETTE} />
          </Field>
        </>
      ) : null}

      {object.kind === 'signature' ? (
        <>
          <Field label="Signer">
            <Input value={object.signer ?? ''} onChange={(e) => onChange({ signer: e.target.value })} className="h-7" />
          </Field>
          {!object.assetId ? (
            <Field label="Typed signature">
              <Input value={object.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} className="h-7" />
            </Field>
          ) : null}
          <Toggle label="Signature line" checked={!!object.rule} onChange={(rule) => onChange({ rule })} />
        </>
      ) : null}

      {object.kind === 'image' ? (
        <>
          <Field label="Fit">
            <Select
              value={object.fit}
              onChange={(fit) => onChange({ fit: fit as 'contain' | 'stretch' })}
              options={[
                { value: 'contain', label: 'Keep aspect ratio' },
                { value: 'stretch', label: 'Stretch to box' },
              ]}
            />
          </Field>
          <Button size="sm" variant="secondary" full onClick={() => void replaceImage(object.id)}>
            Replace image…
          </Button>
        </>
      ) : null}

      {object.kind === 'redact' ? (
        <>
          <Field label="Fill colour">
            <ColorSwatch label="Redaction fill" value={object.color} onChange={(color) => onChange({ color })} palette={['#000000', '#ffffff', '#ff4a3d']} />
          </Field>
          <Field label="Overlay text">
            <Input value={object.label ?? ''} placeholder="e.g. REDACTED" onChange={(e) => onChange({ label: e.target.value })} className="h-7" />
          </Field>
          <Button
            size="sm"
            variant="danger"
            full
            disabled={object.applied}
            onClick={() => {
              useDoc.getState().updateObject(object.id, { applied: true });
              useUI.getState().toast('success', 'Redaction applied — covered text is deleted from the file on export.');
            }}
          >
            {object.applied ? 'Redaction applied' : 'Apply redaction'}
          </Button>
        </>
      ) : null}

      {object.kind === 'measure' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Unit">
              <Select
                value={object.unitLabel}
                onChange={(unitLabel) => onChange({ unitLabel })}
                options={['pt', 'in', 'mm', 'cm', 'px'].map((u) => ({ value: u, label: u }))}
              />
            </Field>
            <NumberField label="Scale" value={object.scale} onChange={(scale) => onChange({ scale })} step={0.1} />
          </div>
          <p className="text-2xs text-ink-500">
            Measured length: {(((object.w * object.scale) / object.pixelsPerUnit) || 0).toFixed(2)} {object.unitLabel}
          </p>
        </>
      ) : null}

      {object.kind === 'link' ? (
        <>
          <Field label="Target">
            <Select
              value={object.linkType}
              onChange={(linkType) => onChange({ linkType: linkType as 'url' | 'page' })}
              options={[
                { value: 'url', label: 'Web address' },
                { value: 'page', label: 'Page in this document' },
              ]}
            />
          </Field>
          {object.linkType === 'url' ? (
            <Field label="URL">
              <Input value={object.url} placeholder="https://…" onChange={(e) => onChange({ url: e.target.value })} className="h-7" />
            </Field>
          ) : (
            <NumberField label="Page number" value={(object.targetPage ?? 0) + 1} onChange={(v) => onChange({ targetPage: Math.max(0, v - 1) })} />
          )}
          <Field label="Tooltip">
            <Input value={object.hint ?? ''} onChange={(e) => onChange({ hint: e.target.value })} className="h-7" />
          </Field>
        </>
      ) : null}

      {object.kind === 'formfield' ? <FormFieldProperties field={object} onChange={onChange} /> : null}

      {/* ---------------------------- arrange ---------------------------- */}
      <div className="space-y-2 border-t border-ink-700 pt-3">
        <div className="flex flex-wrap gap-1">
          <IconButton icon={ArrowUpToLine} label="Bring to front" onClick={() => useDoc.getState().reorderObject(object.id, 'front')} />
          <IconButton icon={ChevronsUp} label="Bring forward" onClick={() => useDoc.getState().reorderObject(object.id, 'forward')} />
          <IconButton icon={ChevronsDown} label="Send backward" onClick={() => useDoc.getState().reorderObject(object.id, 'backward')} />
          <IconButton icon={ArrowDownToLine} label="Send to back" onClick={() => useDoc.getState().reorderObject(object.id, 'back')} />
          <IconButton
            icon={object.locked ? Lock : Unlock}
            label={object.locked ? 'Unlock' : 'Lock'}
            active={!!object.locked}
            onClick={() => onChange({ locked: !object.locked })}
          />
          <IconButton
            icon={Copy}
            label="Duplicate"
            onClick={() => {
              const copy = { ...structuredClone(object), id: uid('obj'), x: object.x + 12, y: object.y - 12, createdAt: Date.now() };
              useDoc.getState().addObject(copy);
              useUI.getState().setSelection([copy.id]);
            }}
          />
          <IconButton
            icon={Trash2}
            label="Delete"
            variant="danger"
            onClick={() => {
              useDoc.getState().removeObjects([object.id]);
              useUI.getState().clearSelection();
            }}
          />
          <IconButton icon={RotateCw} label="Rotate 90°" onClick={() => onChange({ rotation: object.rotation + 90 })} />
        </div>
        <Button size="sm" variant="ghost" full onClick={() => openDialog('shortcuts')}>
          Keyboard shortcuts
        </Button>
      </div>
    </div>
  );
};

async function replaceImage(objectId: string): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const asset = await assetFromFile(file);
    useDoc.getState().addAsset(asset);
    useDoc.getState().updateObject(objectId, { assetId: asset.id } as Partial<AnyObject>);
  };
  input.click();
}

const FormFieldProperties: React.FC<{ field: FormFieldObject; onChange: (patch: Partial<AnyObject>) => void }> = ({ field, onChange }) => (
  <>
    <Field label="Field name">
      <Input value={field.name} onChange={(e) => onChange({ name: e.target.value })} className="h-7 font-mono text-2xs" />
    </Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Font size">
        <Select
          value={String(field.fontSize ?? 12)}
          onChange={(v) => onChange({ fontSize: Number(v) })}
          options={BODY_FONT_SIZES.map((s) => ({ value: String(s), label: `${s} pt` }))}
        />
      </Field>
      <Field label="Colour">
        <ColorSwatch label="Text colour" value={field.color ?? '#000000'} onChange={(color) => onChange({ color })} palette={COLOR_PALETTE} />
      </Field>
    </div>
    {field.field === 'text' ? (
      <>
        <Field label="Default value">
          <Input value={field.value ?? ''} onChange={(e) => onChange({ value: e.target.value })} className="h-7" />
        </Field>
        <div className="flex gap-3">
          <Toggle label="Required" checked={!!field.required} onChange={(required) => onChange({ required })} />
          <Toggle label="Multiline" checked={!!field.multiline} onChange={(multiline) => onChange({ multiline })} />
        </div>
      </>
    ) : null}
    {field.field === 'checkbox' ? (
      <Toggle label="Checked by default" checked={!!field.checked} onChange={(checked) => onChange({ checked })} />
    ) : null}
    {field.field === 'dropdown' ? (
      <Field label="Choices (one per line)">
        <Textarea
          rows={4}
          value={(field.options ?? []).join('\n')}
          onChange={(e) => onChange({ options: e.target.value.split('\n').filter(Boolean) })}
        />
      </Field>
    ) : null}
    {field.field === 'radio' ? (
      <Field label="Group">
        <Input value={field.group ?? ''} onChange={(e) => onChange({ group: e.target.value })} className="h-7" />
      </Field>
    ) : null}
    <p className="text-2xs leading-4 text-ink-500">
      Fields are exported as real AcroForm widgets, so readers can fill them in. Use Export ▸ Flatten to bake the values
      into the page.
    </p>
  </>
);

/* ------------------------------------------------------------------ */
/* Page properties (nothing selected)                                  */
/* ------------------------------------------------------------------ */

const PageProperties: React.FC<{ pageId: PageId }> = ({ pageId }) => {
  const pages = useDoc((s) => s.pages);
  const crops = useDoc((s) => s.crops);
  const objectsByPage = useDoc((s) => s.objectsByPage);
  const objects = useDoc((s) => s.objects);
  const currentPage = useUI((s) => s.currentPage);
  const page = pages.filter((p) => !p.deleted)[currentPage];
  const crop = crops[pageId];
  if (!page) return null;
  const pageObjects = (objectsByPage[pageId] ?? []).map((id) => objects[id]).filter(Boolean);

  return (
    <div className="space-y-4">
      <SectionTitle>Page {currentPage + 1}</SectionTitle>
      <div className="grid grid-cols-2 gap-2 text-2xs text-ink-300">
        <Stat label="Size" value={`${Math.round(page.width)} × ${Math.round(page.height)} pt`} />
        <Stat label="Rotation" value={`${page.rotation}°`} />
        <Stat label="Objects" value={String(pageObjects.length)} />
        <Stat label="Source page" value={String(page.sourceIndex + 1)} />
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="secondary" onClick={() => useDoc.getState().rotatePages([pageId], 90)}>
          <RotateCw size={12} strokeWidth={1.75} /> Rotate
        </Button>
        <Button size="sm" variant="secondary" onClick={() => useDoc.getState().duplicatePages([pageId])}>
          <Copy size={12} strokeWidth={1.75} /> Duplicate
        </Button>
        <Button size="sm" variant="secondary" onClick={() => useUI.setState({ leftPanel: 'thumbs' })}>
          <Layers size={12} strokeWidth={1.75} /> Thumbnails
        </Button>
      </div>
      <div className="rounded-md border border-ink-700 bg-ink-800/50 p-2">
        <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-ink-400">Crop box</p>
        {crop ? (
          <div className="space-y-2">
            <p className="text-2xs text-ink-300">
              {Math.round(crop.x)}, {Math.round(crop.y)} — {Math.round(crop.w)} × {Math.round(crop.h)} pt
            </p>
            <Button size="sm" variant="danger" full onClick={() => useDoc.getState().setCrop(pageId, null)}>
              Clear crop
            </Button>
          </div>
        ) : (
          <p className="text-2xs leading-4 text-ink-500">
            Use the Crop tool in the Export dialog to trim this page. Cropping is non-destructive until you export.
          </p>
        )}
      </div>
      <Button size="sm" variant="ghost" full onClick={() => useUI.setState({ leftPanel: 'thumbs' })}>
        <Plus size={12} strokeWidth={1.75} /> Insert pages from a file
      </Button>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-md border border-ink-700 bg-ink-800/50 px-2 py-1.5">
    <span className="block text-2xs text-ink-500">{label}</span>
    <span className="block truncate text-base text-ink-100">{value}</span>
  </div>
);

/* ------------------------------------------------------------------ */
/* Organise pages                                                      */
/* ------------------------------------------------------------------ */

const OrganizePanel: React.FC = () => {
  const pages = useDoc((s) => s.pages).filter((p) => !p.deleted);
  const currentPage = useUI((s) => s.currentPage);
  const goToPage = useUI((s) => s.goToPage);
  const openDialog = useUI((s) => s.openDialog);
  const [selected, setSelected] = React.useState<number[]>([]);

  const toggle = (index: number) =>
    setSelected((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        {pages.map((page, index) => (
          <button
            key={page.id}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/pm-page', String(index));
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const from = Number(e.dataTransfer.getData('text/pm-page'));
              if (Number.isFinite(from)) useDoc.getState().movePage(from, index);
            }}
            onClick={(e) => {
              if (e.shiftKey || e.metaKey) toggle(index);
              else {
                setSelected([index]);
                goToPage(index);
              }
            }}
            className={`relative rounded-md border p-1 text-left transition-colors ${
              selected.includes(index)
                ? 'border-accent bg-accent/10'
                : currentPage === index
                  ? 'border-ink-600 bg-ink-800'
                  : 'border-ink-700 hover:border-ink-500'
            }`}
          >
            <div
              className="mx-auto bg-white/95"
              style={{ width: '100%', height: Math.round((90 * page.height) / Math.max(1, page.width)) }}
            >
              <div className="grid h-full w-full place-items-center text-2xs text-ink-500">{index + 1}</div>
            </div>
            <span className="mt-1 block truncate text-2xs text-ink-400">
              {index + 1}
              {page.rotation ? ` · ${page.rotation}°` : ''}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="secondary"
          disabled={!selected.length}
          onClick={() => {
            const ids = selected.map((i) => pages[i].id);
            useDoc.getState().rotatePages(ids, 90);
          }}
        >
          <RotateCw size={12} strokeWidth={1.75} /> Rotate
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={selected.length < 2}
          onClick={() => useDoc.getState().movePages(selected.map((i) => pages[i].id), 0)}
        >
          Move to start
        </Button>
        <Button size="sm" variant="secondary" onClick={() => useDoc.getState().reversePages()}>
          Reverse
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!selected.length}
          onClick={() => useDoc.getState().duplicatePages(selected.map((i) => pages[i].id))}
        >
          <Copy size={12} strokeWidth={1.75} /> Duplicate
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={!selected.length || pages.length - selected.length < 1}
          onClick={() => {
            useDoc.getState().deletePages(selected.map((i) => pages[i].id));
            setSelected([]);
          }}
        >
          <Trash2 size={12} strokeWidth={1.75} /> Delete
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void saveSplitFromSelection(selected)} disabled={!selected.length}>
          <FileDown size={12} strokeWidth={1.75} /> Extract
        </Button>
        <Button size="sm" variant="ghost" full onClick={() => openDialog('split')}>
          Split document…
        </Button>
      </div>
      <p className="text-2xs leading-4 text-ink-500">Drag thumbnails to reorder. Shift-click to select several pages.</p>
    </div>
  );
};

async function saveSplitFromSelection(selected: number[]): Promise<void> {
  if (!selected.length) return;
  const sorted = [...selected].sort((a, b) => a - b);
  const groups: number[][] = [];
  let current: number[] = [];
  for (const [i, index] of sorted.entries()) {
    if (i > 0 && index !== sorted[i - 1] + 1) {
      groups.push(current);
      current = [];
    }
    current.push(index);
  }
  if (current.length) groups.push(current);
  await saveSplit(groups);
}

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */

const FormsPanel: React.FC = () => {
  const objects = useDoc((s) => s.objects);
  const setTool = useUI((s) => s.setTool);
  const goToPage = useUI((s) => s.goToPage);
  const setSelection = useUI((s) => s.setSelection);
  const pages = useDoc((s) => s.pages).filter((p) => !p.deleted);
  const fields = useMemo(() => Object.values(objects).filter((o) => o.kind === 'formfield') as FormFieldObject[], [objects]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            ['form-text', 'Text field', Type],
            ['form-checkbox', 'Checkbox', CornerDownRight],
            ['form-radio', 'Radio button', CornerDownRight],
            ['form-dropdown', 'Dropdown', ChevronsDown],
            ['form-button', 'Button', Plus],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTool(id)}
            className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800/60 px-2 py-1.5 text-left text-2xs text-ink-100 hover:border-accent/50"
          >
            <Icon size={13} strokeWidth={1.75} className="text-accent" />
            {label}
          </button>
        ))}
      </div>
      {fields.length === 0 ? (
        <EmptyState icon={Type} title="No form fields yet" hint="Pick a field type, then drag on the page to place it." />
      ) : (
        <ul className="space-y-1">
          {fields.map((field) => (
            <li key={field.id} className="rounded-md border border-ink-700 bg-ink-800/60 p-2">
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left"
                onClick={() => {
                  const index = pages.findIndex((p) => p.id === field.pageId);
                  if (index >= 0) goToPage(index);
                  setSelection([field.id]);
                }}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-2xs text-ink-100">{field.name}</span>
                <Badge tone="neutral">{field.field}</Badge>
              </button>
              {field.value ? <p className="mt-1 truncate text-2xs text-ink-400">Value: {field.value}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <p className="text-2xs leading-4 text-ink-500">
        {fields.length} field(s) will be written as native AcroForm widgets on export.
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Security                                                            */
/* ------------------------------------------------------------------ */

const SecurityPanel: React.FC = () => {
  const security = useDoc((s) => s.security);
  const openDialog = useUI((s) => s.openDialog);
  const setSecurity = useDoc((s) => s.setSecurity);
  const setTool = useUI((s) => s.setTool);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-ink-700 bg-ink-800/60 p-2">
        <span className="text-base text-ink-100">Encryption on export</span>
        <Toggle label="" checked={security.enabled} onChange={(enabled) => setSecurity({ enabled })} />
      </div>
      {security.enabled ? (
        <div className="space-y-2 rounded-md border border-emerald-600/40 bg-emerald-500/5 p-2 text-2xs text-emerald-200">
          <p>AES-256 encryption, user password {security.userPassword ? `(${security.userPassword.length} chars)` : 'not set'}.</p>
          <p>Printing: {security.allowPrinting === 'all' ? 'allowed' : security.allowPrinting === 'none' ? 'blocked' : 'low resolution'}.</p>
        </div>
      ) : null}
      <Button variant="primary" full icon={Shield} onClick={() => openDialog('security')}>
        Set password & permissions
      </Button>
      <Button variant="secondary" full icon={Signature} onClick={() => openDialog('digital-sign')}>
        Add a certificate signature
      </Button>
      <Button variant="secondary" full icon={Trash2} onClick={() => setTool('redact')}>
        Review pending redactions
      </Button>
      <p className="text-2xs leading-4 text-ink-500">
        Passwords are used at export time only and are never stored or transmitted. Losing the password means the file
        cannot be recovered.
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Export presets                                                      */
/* ------------------------------------------------------------------ */

const ExportPanel: React.FC = () => {
  const openDialog = useUI((s) => s.openDialog);
  const toast = useUI((s) => s.toast);
  const docName = useDoc((s) => s.docName);

  const presets: { label: string; hint: string; run: () => Promise<unknown> }[] = [
    {
      label: 'Smallest file size',
      hint: 'PDF, flattened, 150 dpi images',
      run: () => runExport({ ...defaultExportOptions(), format: 'pdf-flat', scale: 1.5 }),
    },
    {
      label: 'High quality print',
      hint: 'PDF with embedded fonts, 300 dpi',
      run: () => runExport({ ...defaultExportOptions(), format: 'pdf', embedFonts: true, scale: 3 }),
    },
    {
      label: 'PDF/A archive',
      hint: 'ISO 19005-1 conformance metadata',
      run: () => runExport({ ...defaultExportOptions(), format: 'pdf-a', pdfA: true, embedFonts: true }),
    },
    {
      label: 'Word document',
      hint: 'Extracted text and images → .docx',
      run: () => runExport({ ...defaultExportOptions(), format: 'docx' }),
    },
    {
      label: 'PowerPoint slides',
      hint: 'One slide per page',
      run: () => runExport({ ...defaultExportOptions(), format: 'pptx' }),
    },
    {
      label: 'Spreadsheet',
      hint: 'Tabular text → .xlsx',
      run: () => runExport({ ...defaultExportOptions(), format: 'xlsx' }),
    },
    {
      label: 'Images (PNG, zipped)',
      hint: 'One PNG per page',
      run: () => runExport({ ...defaultExportOptions(), format: 'png', scale: 2 }),
    },
    {
      label: 'Plain text',
      hint: 'Searchable text with page breaks',
      run: () => runExport({ ...defaultExportOptions(), format: 'txt' }),
    },
    {
      label: 'Web page',
      hint: 'Semantic HTML with the text layer',
      run: () => runExport({ ...defaultExportOptions(), format: 'html' }),
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-2xs text-ink-400">Exporting “{docName}”. Pick a preset or open the full dialog.</p>
      {presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          onClick={() => {
            toast('info', `Preparing ${preset.label.toLowerCase()}…`);
            void preset.run();
          }}
          className="flex w-full items-center justify-between rounded-md border border-ink-700 bg-ink-800/60 px-2.5 py-2 text-left transition-colors hover:border-accent/50"
        >
          <span>
            <span className="block text-base text-ink-100">{preset.label}</span>
            <span className="block text-2xs text-ink-500">{preset.hint}</span>
          </span>
          <FileDown size={14} strokeWidth={1.75} className="text-accent" />
        </button>
      ))}
      <Button variant="primary" full icon={FileDown} onClick={() => openDialog('export')}>
        All export options…
      </Button>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Metadata                                                            */
/* ------------------------------------------------------------------ */

const MetadataPanel: React.FC = () => {
  const meta = useDoc((s) => s.meta);
  const setMeta = useDoc((s) => s.setMeta);
  const openDialog = useUI((s) => s.openDialog);
  return (
    <div className="space-y-3">
      <Field label="Title">
        <Input value={meta.title} onChange={(e) => setMeta({ title: e.target.value })} className="h-7" />
      </Field>
      <Field label="Author">
        <Input value={meta.author} onChange={(e) => setMeta({ author: e.target.value })} className="h-7" />
      </Field>
      <Field label="Subject">
        <Input value={meta.subject} onChange={(e) => setMeta({ subject: e.target.value })} className="h-7" />
      </Field>
      <Field label="Keywords">
        <Input value={meta.keywords} placeholder="comma, separated" onChange={(e) => setMeta({ keywords: e.target.value })} className="h-7" />
      </Field>
      <Field label="Creator">
        <Input value={meta.creator} onChange={(e) => setMeta({ creator: e.target.value })} className="h-7" />
      </Field>
      <Field label="Producer">
        <Input value={meta.producer} onChange={(e) => setMeta({ producer: e.target.value })} className="h-7" />
      </Field>
      <Button variant="secondary" full onClick={() => openDialog('metadata')}>
        More document properties…
      </Button>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Sign                                                                */
/* ------------------------------------------------------------------ */

const SignPanel: React.FC = () => {
  const assets = useDoc((s) => s.assets);
  const setTool = useUI((s) => s.setTool);
  const openDialog = useUI((s) => s.openDialog);
  const setPreviewStamp = useUI((s) => s.setPreviewStamp);
  const signatures = Object.values(assets).filter((a) => a.name?.startsWith('signature') || a.mime === 'image/png');

  return (
    <div className="space-y-3">
      <Button variant="primary" full icon={Signature} onClick={() => setTool('signature')}>
        Place a signature
      </Button>
      <Button variant="secondary" full icon={Signature} onClick={() => openDialog('sign')}>
        Create or manage signatures
      </Button>
      {signatures.length === 0 ? (
        <EmptyState icon={Signature} title="No signatures yet" hint="Draw, type or upload a signature — it stays on this device or in the project file." />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {signatures.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => {
                setPreviewStamp({
                  id: uid('obj'),
                  pageId: '',
                  kind: 'signature',
                  x: 0,
                  y: 0,
                  w: 180,
                  h: 60,
                  rotation: 0,
                  opacity: 1,
                  assetId: asset.id,
                  rule: true,
                } as unknown as Parameters<typeof setPreviewStamp>[0]);
                setTool('signature');
              }}
              className="rounded-md border border-ink-700 bg-white p-1.5 transition-colors hover:border-accent"
            >
              <img src={asset.dataUrl} alt="Signature" className="h-10 w-full object-contain" />
            </button>
          ))}
        </div>
      )}
      <p className="text-2xs leading-4 text-ink-500">
        A drawn or typed signature produces a digital signature appearance. For cryptographic signing, use Protect ▸
        Digital signature.
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* OCR                                                                 */
/* ------------------------------------------------------------------ */

const OcrPanel: React.FC = () => {
  const openDialog = useUI((s) => s.openDialog);
  const ocr = useDoc((s) => s.ocr);
  const pages = useDoc((s) => s.pages).filter((p) => !p.deleted);
  const sources = useDoc((s) => s.sources);
  const addOcrReplacement = useDoc((s) => s.addOcrReplacement);
  const removeOcrReplacement = useDoc((s) => s.removeOcrReplacement);
  const toast = useUI((s) => s.toast);
  const [finds, setFinds] = useState<Record<string, string>>({});
  const [replaces, setReplaces] = useState<Record<string, string>>({});
  const [busyPage, setBusyPage] = useState<string | null>(null);

  const addReplacement = async (page: (typeof pages)[number]) => {
    const result = ocr[page.id];
    const find = (finds[page.id] ?? '').trim();
    const replace = (replaces[page.id] ?? '').trim();
    if (!result) return;
    if (!find) {
      toast('warning', 'Type the recognised word to replace first.');
      return;
    }
    if (!replace) {
      toast('warning', 'Type the replacement text (leave blank to just hide the word).');
      return;
    }
    const source = sources[page.sourceId];
    setBusyPage(page.id);
    try {
      // Validate against the recognised words before persisting anything.
      const preview = planOcrReplacements(result.words, [{ id: 'preview', original: find, text: replace }]);
      if (preview.unmatched.length) {
        toast('warning', `"${find}" was not recognised on page ${page.index + 1}.`);
        return;
      }
      // Sample the background around the first matched word so the covering
      // box blends into the scan. Best effort — falls back to white.
      let bg: string | undefined;
      if (source) {
        const first = result.words[[...preview.replace.keys()][0]];
        if (first) bg = await sampleWordBackground(source, page.sourceIndex, first.rect);
      }
      addOcrReplacement(page.id, { id: uid('ocr-rep'), original: find, text: replace, bg });
      setFinds((prev) => ({ ...prev, [page.id]: '' }));
      setReplaces((prev) => ({ ...prev, [page.id]: '' }));
      toast('success', `“${find}” will be replaced on export (page ${page.index + 1}).`);
    } finally {
      setBusyPage(null);
    }
  };

  return (
    <div className="space-y-3">
      <Button variant="primary" full icon={ScanText} onClick={() => openDialog('ocr')}>
        Recognise text…
      </Button>
      <div className="space-y-1">
        {pages.slice(0, 40).map((page) => {
          const result = ocr[page.id];
          if (!result) {
            return (
              <div key={page.id} className="flex items-center justify-between rounded border border-ink-700 bg-ink-800/50 px-2 py-1 text-2xs">
                <span className="text-ink-300">Page {page.index + 1}</span>
                <span className="text-ink-500">not recognised</span>
              </div>
            );
          }
          const replacements = result.replacements ?? [];
          return (
            <div key={page.id} className="space-y-1.5 rounded border border-ink-700 bg-ink-800/50 p-2">
              <div className="flex items-center justify-between text-2xs">
                <span className="text-ink-300">Page {page.index + 1}</span>
                <Badge tone="success">
                  {Math.round(result.confidence)}% · {result.words.length} words
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  value={finds[page.id] ?? ''}
                  placeholder="Word in scan"
                  onChange={(e) => setFinds((prev) => ({ ...prev, [page.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && void addReplacement(page)}
                  className="h-7 flex-1 text-2xs"
                />
                <Input
                  value={replaces[page.id] ?? ''}
                  placeholder="Replace with"
                  onChange={(e) => setReplaces((prev) => ({ ...prev, [page.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && void addReplacement(page)}
                  className="h-7 flex-1 text-2xs"
                />
                <IconButton
                  icon={Plus}
                  label={`Add replacement on page ${page.index + 1}`}
                  disabled={busyPage === page.id}
                  onClick={() => void addReplacement(page)}
                />
              </div>
              {replacements.length ? (
                <ul className="space-y-1">
                  {replacements.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-2xs">
                      <span className="flex min-w-0 items-center gap-1 text-ink-300">
                        <span className="truncate">{r.original}</span>
                        <CornerDownRight size={10} className="shrink-0 text-ink-500" />
                        <span className="truncate text-ink-100">{r.text || '(hidden)'}</span>
                      </span>
                      <IconButton icon={X} label="Remove replacement" size="sm" onClick={() => removeOcrReplacement(page.id, r.id)} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-2xs leading-4 text-ink-500">
        Recognition runs in a web worker; the invisible text layer is added on export so the scan is searchable. You
        can also replace recognised words: on export the scanned word is covered with a box sampled from the
        surrounding background and re-drawn as visible, searchable text. This is a visual overlay — the original
        pixels remain in the file, so it is not secure redaction.
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Compress                                                            */
/* ------------------------------------------------------------------ */

const CompressPanel: React.FC = () => {
  const openDialog = useUI((s) => s.openDialog);
  const [quality, setQuality] = React.useState(80);
  const [scale, setScale] = React.useState(1.5);
  return (
    <div className="space-y-3">
      <Slider label="Image quality" min={30} max={100} step={1} value={quality} onChange={setQuality} suffix="%" />
      <Slider label="Render scale" min={0.75} max={3} step={0.25} value={scale} onChange={setScale} suffix="×" />
      <Button
        variant="primary"
        full
        icon={Sparkles}
        onClick={() => void runExport({ ...defaultExportOptions(), format: 'pdf-flat', quality, scale })}
      >
        Compress now
      </Button>
      <Button variant="secondary" full icon={Gauge} onClick={() => openDialog('compress')}>
        Advanced compression…
      </Button>
      <p className="text-2xs leading-4 text-ink-500">
        Compression re-renders every page at the chosen scale and re-embeds the images. Text stays selectable; heavy
        vector art becomes raster.
      </p>
    </div>
  );
};

export const PANEL_HELPERS = { sanitizeFilename };
