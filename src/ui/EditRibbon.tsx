import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Crop,
  FileDown,
  Highlighter,
  Layers,
  MessageSquarePlus,
  MousePointer2,
  PenLine,
  Plus,
  Printer,
  RotateCcw,
  RotateCw,
  Save,
  Shield,
  Signature,
  Trash2,
  Type,
} from 'lucide-react';
import { cn } from '../core/utils';
import { useUI } from '../state/ui';
import { printDocument, quickSave } from './actions';
import {
  cropCurrentPage,
  deleteCurrentPage,
  duplicateCurrentPage,
  insertBlankPage,
  moveCurrentPage,
  rotateCurrentPage,
  showFillSign,
  showOrganizePages,
  showProtect,
  useAddText,
  useEditText,
} from './pageActions';

function RibbonButton({
  label,
  icon: Icon,
  active,
  primary,
  onClick,
  hint,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  active?: boolean;
  primary?: boolean;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      title={hint ?? label}
      onClick={onClick}
      className={cn(
        'pm-focus-ring inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium',
        primary
          ? 'bg-accent text-white hover:bg-accent-hover'
          : active
            ? 'bg-accent text-white'
            : 'bg-ink-700/80 text-ink-100 hover:bg-ink-600 hover:text-white',
      )}
    >
      <Icon size={13} strokeWidth={1.75} />
      {label}
    </button>
  );
}

function Group({ label }: { label: string }) {
  return <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</span>;
}

/**
 * Labeled tools, always visible. The icon rail and shortcut list are not a
 * substitute — people need a button they can read and click.
 */
export const EditRibbon: React.FC = () => {
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  const openDialog = useUI((s) => s.openDialog);

  return (
    <div
      className="pm-no-print flex shrink-0 flex-wrap items-center gap-1 border-b border-accent/40 bg-ink-800 px-2 py-1.5"
      data-testid="edit-ribbon"
    >
      <p className="basis-full text-[11px] leading-4 text-ink-300">
        Click <span className="font-medium text-white">Edit text</span>, then a word. The change stays on the page.
        <span className="font-medium text-white"> Save a copy</span> downloads the PDF into your browser’s Downloads folder — this window cannot pick a folder for you.
      </p>
      <Group label="Edit" />
      <RibbonButton label="Select" icon={MousePointer2} active={tool === 'select'} onClick={() => setTool('select')} hint="Select and move objects" />
      <RibbonButton
        label="Edit text"
        icon={Type}
        active={tool === 'editText'}
        onClick={useEditText}
        hint="Click a word to change it. Stays active so the next click edits too."
      />
      <RibbonButton label="Add text" icon={PenLine} active={tool === 'text'} onClick={useAddText} />
      <RibbonButton label="Highlight" icon={Highlighter} active={tool === 'highlight'} onClick={() => setTool('highlight')} />
      <RibbonButton label="Note" icon={MessageSquarePlus} active={tool === 'note'} onClick={() => setTool('note')} />
      <RibbonButton label="Fill & sign" icon={Signature} active={tool === 'signature'} onClick={showFillSign} />
      <RibbonButton label="Protect" icon={Shield} onClick={showProtect} hint="Passwords, permissions, and redaction" />

      <span className="mx-1 h-4 w-px bg-ink-600" />
      <Group label="Edit pages" />
      <RibbonButton label="Rotate left" icon={RotateCcw} onClick={() => rotateCurrentPage(-90)} />
      <RibbonButton label="Rotate right" icon={RotateCw} onClick={() => rotateCurrentPage(90)} />
      <RibbonButton label="Insert page" icon={Plus} onClick={() => void insertBlankPage()} />
      <RibbonButton label="Duplicate" icon={Copy} onClick={duplicateCurrentPage} />
      <RibbonButton label="Delete page" icon={Trash2} onClick={deleteCurrentPage} />
      <RibbonButton label="Move up" icon={ChevronUp} onClick={() => moveCurrentPage(-1)} hint="Move this page earlier" />
      <RibbonButton label="Move down" icon={ChevronDown} onClick={() => moveCurrentPage(1)} hint="Move this page later" />
      <RibbonButton label="Crop" icon={Crop} active={tool === 'crop'} onClick={cropCurrentPage} />
      <RibbonButton label="Organize pages" icon={Layers} onClick={showOrganizePages} hint="Thumbnails — drag to reorder, or use the buttons above" />

      <span className="mx-1 h-4 w-px bg-ink-600" />
      <RibbonButton
        label="Save a copy"
        icon={Save}
        primary
        onClick={() => void quickSave()}
        hint="Builds the PDF and opens a download. This preview cannot choose a folder by itself."
      />
      <RibbonButton label="Export" icon={FileDown} onClick={() => openDialog('export')} />
      <RibbonButton label="Print" icon={Printer} onClick={() => void printDocument()} />
    </div>
  );
};
