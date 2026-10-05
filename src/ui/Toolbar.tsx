import React from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  CircleDot,
  Crop,
  Diamond,
  Eraser,
  FormInput,
  Highlighter,
  ImagePlus,
  Italic,
  Layers,
  Lock,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  MoveHorizontal,
  Plus,
  Printer,
  RotateCw,
  Save,
  ScanText,
  Shield,
  Sparkles,
  Stamp,
  Trash2,
  Type,
} from 'lucide-react';
import { useUI } from '../state/ui';
import { storeIndexFromVisual, useDoc } from '../state/store';
import type { ToolId } from '../core/constants';
import { BODY_FONT_SIZES, COLOR_PALETTE, HIGHLIGHT_COLORS, STAMPS, TEXT_FONTS } from '../core/constants';
import { ColorSwatch, IconButton, Menu, MenuItem, MenuSeparator, Select, Slider, Toggle } from './primitives';
import { addImageToPage, printDocument, quickSave } from './actions';

const MARKUP: ToolId[] = ['highlight', 'underline', 'strike', 'squiggly'];
const FORMS: ToolId[] = ['form-text', 'form-checkbox', 'form-radio', 'form-dropdown', 'form-button'];

export const Toolbar: React.FC = () => {
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  const options = useUI((s) => s.toolOptions);
  const setToolOption = useUI((s) => s.setToolOption);
  const setToolOptions = useUI((s) => s.setToolOptions);
  const openDialog = useUI((s) => s.openDialog);
  const rightPanel = useUI((s) => s.rightPanel);
  const setRightPanel = useUI((s) => s.setRightPanel);
  const currentPage = useUI((s) => s.currentPage);
  const pages = useDoc((s) => s.pages);
  const activePages = pages.filter((p) => !p.deleted);
  const page = activePages[currentPage];

  return (
    <div
      className="pm-no-print relative z-20 flex h-11 items-center gap-1 border-b border-ink-700 bg-ink-800 px-2"
      data-testid="toolbar"
    >
      <GroupButton
        icon={<MousePointer2 size={15} strokeWidth={1.75} />}
        label="Select"
        active={tool === 'select' || tool === 'hand' || tool === 'eraser'}
        onClick={() => setTool('select')}
        items={[
          { label: 'Select & move', run: () => setTool('select') },
          { label: 'Pan document', run: () => setTool('hand') },
          { label: 'Erase object', run: () => setTool('eraser') },
        ]}
      />
      <GroupButton
        icon={<Type size={15} strokeWidth={1.75} />}
        label="Edit"
        active={tool === 'text' || tool === 'editText' || tool === 'image' || tool === 'shape' || tool === 'draw'}
        onClick={() => setTool('text')}
        items={[
          { label: 'Add text box', run: () => setTool('text') },
          { label: 'Edit text in document', run: () => setTool('editText') },
          { label: 'Insert image', run: () => setTool('image') },
          { label: 'Shapes & arrows', run: () => setTool('shape') },
          { label: 'Freehand draw', run: () => setTool('draw') },
          { separator: true, label: '' },
          { label: 'Fill & sign…', run: () => openDialog('sign') },
        ]}
      />
      <GroupButton
        icon={<Highlighter size={15} strokeWidth={1.75} />}
        label="Comment"
        active={MARKUP.includes(tool) || tool === 'note'}
        onClick={() => setTool('highlight')}
        items={[
          { label: 'Highlight text', run: () => setTool('highlight') },
          { label: 'Underline text', run: () => setTool('underline') },
          { label: 'Strikethrough text', run: () => setTool('strike') },
          { label: 'Squiggly underline', run: () => setTool('squiggly') },
          { separator: true, label: '' },
          { label: 'Sticky note', run: () => setTool('note') },
          { label: 'Link', run: () => setTool('link') },
          { label: 'Measure', run: () => setTool('measure') },
        ]}
      />
      <GroupButton
        icon={<Stamp size={15} strokeWidth={1.75} />}
        label="Stamp"
        active={tool === 'stamp' || tool === 'signature'}
        onClick={() => setTool('stamp')}
        items={[
          { label: 'Stamp', run: () => setTool('stamp') },
          { label: 'Signature', run: () => setTool('signature') },
          { separator: true, label: '' },
          { label: 'Request certificate signature…', run: () => openDialog('digital-sign') },
        ]}
      />
      <GroupButton
        icon={<FormInput size={15} strokeWidth={1.75} />}
        label="Forms"
        active={FORMS.includes(tool)}
        onClick={() => setTool('form-text')}
        items={[
          { label: 'Text field', run: () => setTool('form-text') },
          { label: 'Checkbox', run: () => setTool('form-checkbox') },
          { label: 'Radio button', run: () => setTool('form-radio') },
          { label: 'Dropdown list', run: () => setTool('form-dropdown') },
          { label: 'Push button', run: () => setTool('form-button') },
        ]}
      />
      <GroupButton
        icon={<Shield size={15} strokeWidth={1.75} />}
        label="Protect"
        active={tool === 'redact'}
        onClick={() => setTool('redact')}
        items={[
          { label: 'Mark for redaction', run: () => setTool('redact') },
          { separator: true, label: '' },
          { label: 'Password & permissions…', run: () => openDialog('security') },
          { label: 'Digital signature…', run: () => openDialog('digital-sign') },
        ]}
      />
      <GroupButton
        icon={<Sparkles size={15} strokeWidth={1.75} />}
        label="Tools"
        active={false}
        onClick={() => openDialog('ocr')}
        items={[
          { label: 'Recognise text (OCR)…', run: () => openDialog('ocr') },
          { label: 'Compress & optimise…', run: () => openDialog('compress') },
          { separator: true, label: '' },
          { label: 'Document properties…', run: () => openDialog('metadata') },
          { label: 'File attachments…', run: () => openDialog('attachments') },
          { label: 'Document JavaScript…', run: () => openDialog('javascript') },
          { label: 'Split document…', run: () => openDialog('split') },
        ]}
      />

      <div className="mx-1 h-6 w-px shrink-0 bg-ink-700" />

      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto pr-2">
        {MARKUP.includes(tool) ? (
          <>
            <ColorSwatch
              label="Colour"
              value={options.color}
              onChange={(color) => setToolOption('color', color)}
              palette={HIGHLIGHT_COLORS}
            />
            <div className="w-28 shrink-0">
              <Slider label="Opacity" min={0.1} max={1} step={0.05} value={options.opacity} onChange={(v) => setToolOption('opacity', v)} />
            </div>
            <div className="w-28 shrink-0">
              <Slider label="Width" min={0.5} max={12} step={0.5} value={options.strokeWidth} onChange={(v) => setToolOption('strokeWidth', v)} />
            </div>
          </>
        ) : null}

        {tool === 'text' ? (
          <>
            <Select
              className="w-32 shrink-0"
              value={options.fontFamily}
              onChange={(v) => setToolOption('fontFamily', v)}
              options={TEXT_FONTS.map((f) => ({ value: f.id, label: f.label }))}
            />
            <Select
              className="w-20 shrink-0"
              value={String(options.fontSize)}
              onChange={(v) => setToolOption('fontSize', Number(v))}
              options={BODY_FONT_SIZES.map((s) => ({ value: String(s), label: `${s} pt` }))}
            />
            <IconButton icon={Bold} label="Bold" active={options.bold} onClick={() => setToolOption('bold', !options.bold)} />
            <IconButton icon={Italic} label="Italic" active={options.italic} onClick={() => setToolOption('italic', !options.italic)} />
            <div className="flex shrink-0 items-center rounded-md border border-ink-600">
              {(
                [
                  ['left', AlignLeft],
                  ['center', AlignCenter],
                  ['right', AlignRight],
                ] as const
              ).map(([value, Icon]) => (
                <button
                  key={value}
                  type="button"
                  title={`Align ${value}`}
                  onClick={() => setToolOption('align', value)}
                  className={`grid h-7 w-7 place-items-center text-ink-200 transition-colors ${
                    options.align === value ? 'bg-ink-600 text-white' : 'hover:bg-ink-700'
                  }`}
                >
                  <Icon size={13} strokeWidth={1.75} />
                </button>
              ))}
            </div>
            <ColorSwatch label="Text colour" value={options.color} onChange={(color) => setToolOption('color', color)} palette={COLOR_PALETTE} />
            <Toggle label="Auto-wrap" checked={options.textAuto} onChange={(v) => setToolOption('textAuto', v)} />
          </>
        ) : null}

        {tool === 'shape' || tool === 'draw' ? (
          <>
            <ColorSwatch label="Colour" value={options.color} onChange={(color) => setToolOption('color', color)} palette={COLOR_PALETTE} />
            {tool === 'shape' ? (
              <Select
                className="w-28 shrink-0"
                value={options.shape}
                onChange={(v) => setToolOptions({ shape: v as typeof options.shape })}
                options={[
                  { value: 'rect', label: 'Rectangle' },
                  { value: 'ellipse', label: 'Ellipse' },
                  { value: 'line', label: 'Line' },
                  { value: 'arrow', label: 'Arrow' },
                  { value: 'polygon', label: 'Polygon' },
                  { value: 'cloud', label: 'Cloud' },
                ]}
              />
            ) : null}
            <div className="w-28 shrink-0">
              <Slider label="Width" min={0.5} max={tool === 'draw' ? 20 : 16} step={0.5} value={options.strokeWidth} onChange={(v) => setToolOption('strokeWidth', v)} />
            </div>
            {tool === 'shape' ? (
              <>
                <Toggle label="Fill" checked={options.fill !== null} onChange={(v) => setToolOption('fill', v ? options.color : null)} />
                <Toggle label="Dashed" checked={options.dashed} onChange={(v) => setToolOption('dashed', v)} />
              </>
            ) : (
              <Toggle label="Highlighter" checked={options.highlighter} onChange={(v) => setToolOption('highlighter', v)} />
            )}
          </>
        ) : null}

        {tool === 'stamp' ? (
          <Select
            className="w-44 shrink-0"
            value={options.stampId}
            onChange={(v) => setToolOption('stampId', v)}
            options={STAMPS.map((s) => ({ value: s.id, label: s.label }))}
          />
        ) : null}

        {tool === 'note' || tool === 'signature' || tool === 'redact' ? (
          <ColorSwatch label="Colour" value={options.color} onChange={(color) => setToolOption('color', color)} palette={COLOR_PALETTE} />
        ) : null}

        {tool === 'link' ? <span className="pm-hint">Drag over the area to link, then set the target in the Properties panel.</span> : null}
        {FORMS.includes(tool) ? <span className="pm-hint">Drag to place the field — exported as a real AcroForm field.</span> : null}
        {tool === 'editText' ? <span className="pm-hint">Click a line of text to rewrite it; the font, size and position are preserved.</span> : null}
        {tool === 'image' ? <span className="pm-hint">Click the page to choose an image, or drop an image file onto the page.</span> : null}
        {tool === 'redact' ? (
          <span className="pm-hint">Draw over content, then Protect ▸ Apply redactions — covered text is deleted from the file.</span>
        ) : null}
        {tool === 'select' || tool === 'hand' ? (
          <span className="pm-hint">
            Click to select, drag to move, double-click text to edit, Ctrl+scroll to zoom.
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton
          icon={RotateCw}
          label="Rotate page 90°"
          disabled={!page}
          onClick={() => page && useDoc.getState().rotatePages([page.id], 90)}
        />
        <IconButton
          icon={Plus}
          label="Insert blank page"
          onClick={() => useDoc.getState().addBlankPage(undefined, storeIndexFromVisual(useDoc.getState().pages, currentPage + 1))}
        />
        <IconButton
          icon={Trash2}
          label="Delete current page"
          disabled={!page || activePages.length <= 1}
          onClick={() => page && useDoc.getState().deletePages([page.id])}
        />
        <IconButton icon={ImagePlus} label="Insert image" disabled={!page} onClick={() => page && void addImageToPage(page.id)} />
        <IconButton icon={Layers} label="Organise pages" active={rightPanel === 'organize'} onClick={() => setRightPanel('organize')} />
        <IconButton icon={Crop} label="Crop page" onClick={() => setTool('crop')} />
        <IconButton icon={ScanText} label="OCR this document" onClick={() => openDialog('ocr')} />
        <IconButton icon={Lock} label="Password & permissions" onClick={() => openDialog('security')} />
      </div>

      <div className="mx-1 h-6 w-px shrink-0 bg-ink-700" />

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => openDialog('export')}
          className="pm-focus-ring flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          Export
        </button>
        <button
          type="button"
          onClick={() => void quickSave()}
          className="pm-focus-ring flex h-7 items-center gap-1.5 rounded-md border border-ink-600 px-2 text-xs text-ink-100 transition-colors hover:bg-ink-700"
        >
          <Save size={12} strokeWidth={1.75} /> Save
        </button>
        <button
          type="button"
          onClick={() => void printDocument()}
          className="pm-focus-ring flex h-7 items-center gap-1.5 rounded-md border border-ink-600 px-2 text-xs text-ink-100 transition-colors hover:bg-ink-700"
        >
          <Printer size={12} strokeWidth={1.75} /> Print
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Tool-group button with a flyout.                                    */
/* ------------------------------------------------------------------ */

interface GroupItem {
  label: string;
  separator?: boolean;
  run?: () => void;
}

const GroupButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  items: GroupItem[];
}> = ({ icon, label, active, onClick, items }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative flex shrink-0">
      <button
        type="button"
        onClick={onClick}
        title={label}
        className={`pm-focus-ring flex h-7 items-center gap-1.5 rounded-l-md border px-2 text-xs font-medium transition-colors ${
          active ? 'border-accent/60 bg-accent/15 text-white' : 'border-ink-600 bg-ink-750 text-ink-100 hover:bg-ink-700'
        }`}
      >
        {icon}
        <span className="hidden xl:inline">{label}</span>
      </button>
      <button
        type="button"
        aria-label={`${label} menu`}
        onClick={() => setOpen((v) => !v)}
        className={`pm-focus-ring flex h-7 items-center rounded-r-md border border-l-0 px-1 transition-colors ${
          open || active ? 'border-accent/60 bg-accent/15 text-white' : 'border-ink-600 bg-ink-750 text-ink-200 hover:bg-ink-700'
        }`}
      >
        <ChevronDown size={11} strokeWidth={2} />
      </button>
      <div className="absolute left-0 top-8 z-40">
        <Menu open={open} onClose={() => setOpen(false)} width={230}>
          {items.map((item, index) =>
            item.separator ? (
              <MenuSeparator key={`sep-${index}`} />
            ) : (
              <MenuItem
                key={item.label}
                onClick={() => {
                  setOpen(false);
                  item.run?.();
                }}
              >
                {item.label}
              </MenuItem>
            ),
          )}
        </Menu>
      </div>
    </div>
  );
};

/** Icons kept for the toolbar's own use elsewhere. */
export const TOOLBAR_ICONS = { Minus, MoveHorizontal, CircleDot, Diamond, Eraser, MessageSquarePlus };
