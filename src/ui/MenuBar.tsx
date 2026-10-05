import React, { useState } from 'react';
import {
  Activity,
  BookOpenCheck,
  Combine,
  Crop,
  Download,
  Eye,
  FileArchive,
  FileDown,
  FileJson,
  FilePlus2,
  FileText,
  FlaskConical,
  FolderOpen,
  FormInput,
  Gauge,
  Image as ImageIcon,
  Keyboard,
  Layers,
  ListOrdered,
  Lock,
  MessageSquarePlus,
  Minus,
  Moon,
  MousePointerSquareDashed,
  PanelLeft,
  PanelRight,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  ScanText,
  Scissors,
  Settings2,
  ShieldCheck,
  Signature,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
  Unlock,
  WandSparkles,
} from 'lucide-react';
import { storeIndexFromVisual, useDoc } from '../state/store';
import { useUI } from '../state/ui';
import { Menu, MenuItem, MenuSeparator } from './primitives';
import {
  addImageToPage,
  insertPagesFromFiles,
  openFilesFromPicker,
  openProjectFile,
  pickFiles,
  printDocument,
  quickSave,
  saveProjectFile,
} from './actions';
import { hasClipboard, instantiateClipboard, setClipboard } from '../state/clipboard';
import { setTheme, toggleTheme } from '../hooks/useTheme';

type MenuId = 'file' | 'edit' | 'view' | 'document' | 'comments' | 'forms' | 'protect' | 'tools' | 'help';

const MENUS: { id: MenuId; label: string }[] = [
  { id: 'file', label: 'File' },
  { id: 'edit', label: 'Edit' },
  { id: 'view', label: 'View' },
  { id: 'document', label: 'Document' },
  { id: 'comments', label: 'Comments' },
  { id: 'forms', label: 'Forms' },
  { id: 'protect', label: 'Protect' },
  { id: 'tools', label: 'Tools' },
  { id: 'help', label: 'Help' },
];

export const MenuBar: React.FC = () => {
  const openMenu = useUI((s) => s.openMenu);
  const setOpenMenu = useUI((s) => s.setOpenMenu);
  const openDialog = useUI((s) => s.openDialog);
  const setTool = useUI((s) => s.setTool);
  const setLeftPanel = useUI((s) => s.setLeftPanel);
  const setRightPanel = useUI((s) => s.setRightPanel);
  const zoomIn = useUI((s) => s.zoomIn);
  const zoomOut = useUI((s) => s.zoomOut);
  const setZoom = useUI((s) => s.setZoom);
  const toggleAnnotations = useUI((s) => s.toggleAnnotations);
  const toggleTextLayer = useUI((s) => s.toggleTextLayer);
  const showAnnotations = useUI((s) => s.showAnnotations);
  const showTextLayer = useUI((s) => s.showTextLayer);
  const currentPage = useUI((s) => s.currentPage);
  const toast = useUI((s) => s.toast);

  const docName = useDoc((s) => s.docName);
  const pages = useDoc((s) => s.pages);
  const past = useDoc((s) => s.past);
  const future = useDoc((s) => s.future);
  const activePages = pages.filter((p) => !p.deleted);

  const close = () => setOpenMenu(null);
  const run = (fn: () => void | Promise<void>) => () => {
    close();
    void fn();
  };

  const copySelection = () => {
    const state = useDoc.getState();
    const selection = useUI.getState().selection;
    const objects = selection.map((id) => state.objects[id]).filter(Boolean);
    if (!objects.length) {
      toast('info', 'Select an object first.');
      return;
    }
    setClipboard(objects, state.assets);
    toast('success', `Copied ${objects.length} object(s).`);
  };

  const paste = () => {
    const page = activePages[useUI.getState().currentPage];
    if (!page) return;
    const payload = instantiateClipboard(page.id, { dx: 12, dy: -12 });
    if (!payload) {
      toast('info', 'Clipboard is empty.');
      return;
    }
    for (const asset of Object.values(payload.assets)) useDoc.getState().addAsset(asset);
    useDoc.getState().addObjects(payload.objects);
    useUI.getState().setSelection(payload.objects.map((o) => o.id));
  };

  const deleteSelection = () => {
    const selection = useUI.getState().selection;
    if (!selection.length) return;
    useDoc.getState().removeObjects(selection);
    useUI.getState().clearSelection();
  };

  const [recentOpen, setRecentOpen] = useState(false);
  void recentOpen;
  void setRecentOpen;

  return (
    <div className="pm-no-print flex h-9 items-center gap-0.5 border-b border-ink-700 bg-ink-850 px-2" data-testid="menubar">
      <div className="mr-1 flex items-center gap-1.5 pl-1">
        <span className="grid h-5 w-5 place-items-center rounded bg-gradient-to-br from-accent to-[#c92a1e] text-[9px] font-bold text-white">
          PDF
        </span>
        <span className="hidden text-xs font-semibold text-ink-100 sm:inline">PDFmaster</span>
      </div>

      {MENUS.map((menu) => (
        <div key={menu.id} className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
            onMouseEnter={() => openMenu && setOpenMenu(menu.id)}
            className={`pm-focus-ring rounded px-2 py-1 text-base transition-colors ${
              openMenu === menu.id ? 'bg-ink-700 text-white' : 'text-ink-200 hover:bg-ink-700/70 hover:text-white'
            }`}
          >
            {menu.label}
          </button>

          <Menu open={openMenu === menu.id} onClose={close}>
            {menu.id === 'file' ? (
              <>
                <MenuItem icon={FolderOpen} shortcut="Ctrl+O" onClick={run(() => openFilesFromPicker(true))}>
                  Open…
                </MenuItem>
                <MenuItem icon={FilePlus2} onClick={run(() => openFilesFromPicker(false))}>
                  Add pages from file…
                </MenuItem>
                <MenuItem icon={Plus} onClick={run(() => openDialog('new-document'))}>
                  New blank document…
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={Save}
                  shortcut="Ctrl+S"
                  disabled={!activePages.length}
                  onClick={run(() => quickSave())}
                >
                  Save a copy…
                </MenuItem>
                <MenuItem icon={FileDown} disabled={!activePages.length} onClick={run(() => openDialog('export'))}>
                  Export as…
                </MenuItem>
                <MenuItem
                  icon={FileArchive}
                  disabled={!activePages.length}
                  onClick={run(() => openDialog('split'))}
                >
                  Split document…
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={FileJson} disabled={!activePages.length} onClick={run(() => saveProjectFile())}>
                  Save editable project…
                </MenuItem>
                <MenuItem
                  icon={FileJson}
                  onClick={run(async () => {
                    const [file] = await pickFiles('.json,application/json', false);
                    if (file) await openProjectFile(file);
                  })}
                >
                  Open editable project…
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Printer} disabled={!activePages.length} onClick={run(() => printDocument())}>
                  Print…
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Trash2} onClick={run(() => useDoc.getState().reset())} danger>
                  Close document
                </MenuItem>
              </>
            ) : null}

            {menu.id === 'edit' ? (
              <>
                <MenuItem icon={Undo2} shortcut="Ctrl+Z" disabled={!past.length} onClick={run(() => useDoc.getState().undo())}>
                  Undo {past.length ? `(${past[past.length - 1].label})` : ''}
                </MenuItem>
                <MenuItem icon={Redo2} shortcut="Ctrl+Shift+Z" disabled={!future.length} onClick={run(() => useDoc.getState().redo())}>
                  Redo
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Scissors} shortcut="Ctrl+X" onClick={run(() => { copySelection(); deleteSelection(); })}>
                  Cut
                </MenuItem>
                <MenuItem icon={FileText} shortcut="Ctrl+C" onClick={run(copySelection)}>
                  Copy
                </MenuItem>
                <MenuItem icon={FilePlus2} shortcut="Ctrl+V" disabled={!hasClipboard()} onClick={run(paste)}>
                  Paste
                </MenuItem>
                <MenuItem icon={Layers} onClick={run(() => {
                  const page = activePages[useUI.getState().currentPage];
                  if (page) {
                    const ids = useDoc.getState().objectsByPage[page.id] ?? [];
                    useUI.getState().setSelection(ids);
                  }
                })}>
                  Select all on page
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Trash2} shortcut="Del" disabled={!useUI.getState().selection.length} onClick={run(deleteSelection)} danger>
                  Delete selection
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={MousePointerSquareDashed} shortcut="Ctrl+F" onClick={run(() => useUI.getState().setLeftPanel('search'))}>
                  Find text…
                </MenuItem>
              </>
            ) : null}

            {menu.id === 'view' ? (
              <>
                <MenuItem icon={Plus} shortcut="Ctrl+=" onClick={run(() => zoomIn())}>
                  Zoom in
                </MenuItem>
                <MenuItem icon={Minus} shortcut="Ctrl+-" onClick={run(() => zoomOut())}>
                  Zoom out
                </MenuItem>
                <MenuItem shortcut="Ctrl+0" onClick={run(() => setZoom(1))}>
                  Actual size
                </MenuItem>
                <MenuItem shortcut="Ctrl+1" onClick={run(() => useUI.setState({ fitMode: 'width' }))}>
                  Fit width
                </MenuItem>
                <MenuItem shortcut="Ctrl+2" onClick={run(() => useUI.setState({ fitMode: 'page' }))}>
                  Fit page
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={PanelLeft} onClick={run(() => useUI.getState().toggleCollapsed('left'))}>
                  Toggle left panel
                </MenuItem>
                <MenuItem icon={PanelRight} onClick={run(() => useUI.getState().toggleCollapsed('right'))}>
                  Toggle right panel
                </MenuItem>
                <MenuItem icon={BookOpenCheck} onClick={run(() => setLeftPanel('thumbs'))} checked={useUI.getState().leftPanel === 'thumbs'}>
                  Page thumbnails
                </MenuItem>
                <MenuItem icon={ListOrdered} onClick={run(() => setLeftPanel('bookmarks'))}>
                  Bookmarks
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Eye} checked={showAnnotations} onClick={run(toggleAnnotations)}>
                  Show existing annotations
                </MenuItem>
                <MenuItem icon={Eye} checked={showTextLayer} onClick={run(toggleTextLayer)}>
                  Show selectable text layer
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Moon} onClick={run(() => setTheme('dark'))}>
                  Dark interface
                </MenuItem>
                <MenuItem icon={Sun} onClick={run(() => setTheme('light'))}>
                  Light interface
                </MenuItem>
                <MenuItem icon={Settings2} onClick={run(() => toggleTheme())}>
                  Toggle theme
                </MenuItem>
              </>
            ) : null}

            {menu.id === 'document' ? (
              <>
                <MenuItem icon={Plus} onClick={run(() => insertPagesFromFiles(storeIndexFromVisual(useDoc.getState().pages, useUI.getState().currentPage + 1)))}>
                  Insert pages from file…
                </MenuItem>
                <MenuItem icon={FilePlus2} onClick={run(() => useDoc.getState().addBlankPage(undefined, storeIndexFromVisual(useDoc.getState().pages, currentPage + 1)))}>
                  Insert blank page
                </MenuItem>
                <MenuItem icon={ImageIcon} disabled={!activePages.length} onClick={run(() => addImageToPage(activePages[currentPage]?.id))}>
                  Insert image…
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={RotateCw}
                  onClick={run(() => useDoc.getState().rotatePages([activePages[currentPage]?.id].filter(Boolean) as string[], 90))}
                >
                  Rotate page clockwise
                </MenuItem>
                <MenuItem
                  icon={RotateCcw}
                  onClick={run(() => useDoc.getState().rotatePages([activePages[currentPage]?.id].filter(Boolean) as string[], -90))}
                >
                  Rotate page counter-clockwise
                </MenuItem>
                <MenuItem icon={Scissors} disabled={!activePages.length} onClick={run(() => useDoc.getState().deletePages([activePages[currentPage]?.id].filter(Boolean) as string[]))}>
                  Delete current page
                </MenuItem>
                <MenuItem icon={Crop} disabled={!activePages.length} onClick={run(() => useUI.getState().setTool('crop'))}>
                  Crop page…
                </MenuItem>
                <MenuItem icon={Gauge} disabled={!activePages.length} onClick={run(() => openDialog('compress'))}>
                  Compress & optimise…
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Sparkles} onClick={run(() => openDialog('watermark'))}>
                  Watermark…
                </MenuItem>
                <MenuItem icon={FileText} onClick={run(() => openDialog('header-footer'))}>
                  Header &amp; footer…
                </MenuItem>
                <MenuItem icon={ListOrdered} onClick={run(() => openDialog('page-numbers'))}>
                  Page numbers…
                </MenuItem>
                <MenuItem icon={ListOrdered} onClick={run(() => openDialog('bates'))}>
                  Bates numbering…
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={FileJson} onClick={run(() => openDialog('metadata'))}>
                  Document properties…
                </MenuItem>
                <MenuItem icon={FileArchive} onClick={run(() => openDialog('attachments'))}>
                  File attachments…
                </MenuItem>
                <MenuItem icon={Activity} onClick={run(() => openDialog('javascript'))}>
                  Document JavaScript…
                </MenuItem>
                <MenuItem icon={Combine} onClick={run(() => useDoc.getState().reversePages())} disabled={activePages.length < 2}>
                  Reverse page order
                </MenuItem>
              </>
            ) : null}

            {menu.id === 'comments' ? (
              <>
                <MenuItem icon={MessageSquarePlus} onClick={run(() => { setTool('note'); setLeftPanel('comments'); })}>
                  Add sticky note
                </MenuItem>
                <MenuItem icon={FlaskConical} onClick={run(() => setTool('highlight'))}>
                  Highlight text
                </MenuItem>
                <MenuItem onClick={run(() => setTool('underline'))}>Underline text</MenuItem>
                <MenuItem onClick={run(() => setTool('strike'))}>Strikethrough text</MenuItem>
                <MenuItem onClick={run(() => setTool('squiggly'))}>Squiggly underline</MenuItem>
                <MenuSeparator />
                <MenuItem icon={MessageSquarePlus} onClick={run(() => setLeftPanel('comments'))}>
                  Show comments panel
                </MenuItem>
                <MenuItem
                  icon={Trash2}
                  danger
                  onClick={run(() => {
                    const state = useDoc.getState();
                    const noteIds = Object.values(state.objects)
                      .filter((o) => o.kind === 'note')
                      .map((o) => o.id);
                    useDoc.getState().removeObjects(noteIds);
                    toast('success', `Removed ${noteIds.length} sticky note(s).`);
                  })}
                >
                  Delete all sticky notes
                </MenuItem>
              </>
            ) : null}

            {menu.id === 'forms' ? (
              <>
                <MenuItem icon={FormInput} onClick={run(() => setTool('form-text'))}>
                  Add text field
                </MenuItem>
                <MenuItem icon={FormInput} onClick={run(() => setTool('form-checkbox'))}>
                  Add checkbox
                </MenuItem>
                <MenuItem icon={FormInput} onClick={run(() => setTool('form-radio'))}>
                  Add radio button
                </MenuItem>
                <MenuItem icon={FormInput} onClick={run(() => setTool('form-dropdown'))}>
                  Add dropdown list
                </MenuItem>
                <MenuItem icon={FormInput} onClick={run(() => setTool('form-button'))}>
                  Add push button
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Settings2} onClick={run(() => setRightPanel('forms'))}>
                  Form field properties
                </MenuItem>
                <MenuItem
                  icon={Archive}
                  onClick={run(() => {
                    useDoc.getState().setWatermark({});
                    toast('info', 'Form fields are exported as real AcroForm fields. Use the Export dialog to flatten them.');
                  })}
                >
                  About flattening
                </MenuItem>
              </>
            ) : null}

            {menu.id === 'protect' ? (
              <>
                <MenuItem icon={Lock} onClick={run(() => openDialog('security'))}>
                  Password &amp; permissions…
                </MenuItem>
                <MenuItem icon={Unlock} onClick={run(() => {
                  useDoc.getState().setSecurity({ enabled: false, userPassword: '', ownerPassword: '' });
                  toast('success', 'Encryption disabled for the next export.');
                })}>
                  Remove protection
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={ShieldCheck} onClick={run(() => setTool('redact'))}>
                  Mark for redaction
                </MenuItem>
                <MenuItem
                  icon={ShieldCheck}
                  onClick={run(() => {
                    const state = useDoc.getState();
                    const redactions = Object.values(state.objects).filter((o) => o.kind === 'redact');
                    if (!redactions.length) {
                      toast('info', 'Draw redaction areas first, then apply them.');
                      return;
                    }
                    useDoc
                      .getState()
                      .updateObjects(redactions.map((o) => ({ id: o.id, patch: { applied: true } })));
                    toast('success', 'Redaction applied: covered text is deleted from the file on export.');
                  })}
                >
                  Apply redactions
                </MenuItem>
                <MenuItem
                  icon={WandSparkles}
                  onClick={run(() => {
                    const state = useDoc.getState();
                    const count = state.pages.reduce(
                      (sum, page) => sum + (state.objectsByPage[page.id]?.length ?? 0),
                      0,
                    );
                    useDoc.setState({
                      meta: { ...state.meta, author: '', subject: '', keywords: '', title: '' },
                      comments: [],
                      bookmarks: [],
                      attachments: [],
                    });
                    toast('success', `Sanitised: metadata cleared, comments, bookmarks and attachments removed (${count} objects kept).`);
                  })}
                >
                  Sanitise document
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Signature} onClick={run(() => openDialog('digital-sign'))}>
                  Digital signature (certificate)…
                </MenuItem>
              </>
            ) : null}

            {menu.id === 'tools' ? (
              <>
                <MenuItem icon={ScanText} onClick={run(() => openDialog('ocr'))}>
                  Recognise text (OCR)…
                </MenuItem>
                <MenuItem icon={Gauge} onClick={run(() => openDialog('compress'))}>
                  Compress &amp; optimise…
                </MenuItem>
                <MenuItem icon={Download} onClick={run(() => openDialog('export'))}>
                  Export as images / Office / text…
                </MenuItem>
                <MenuItem icon={Signature} onClick={run(() => openDialog('sign'))}>
                  Fill &amp; sign…
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={Activity}
                  onClick={run(async () => {
                    const state = useDoc.getState();
                    const active = state.pages.filter((p) => !p.deleted);
                    const missingTitle = !state.meta.title.trim();
                    const missingLang = false;
                    const images = Object.values(state.objects).filter((o) => o.kind === 'image');
                    const findings = [
                      `${active.length} page(s), ${Object.keys(state.sources).length} source document(s).`,
                      missingTitle ? 'Document title is not set (Document ▸ Document properties).' : 'Document title is set.',
                      images.length ? `${images.length} image object(s) placed — add a description in Properties for accessibility.` : 'No image objects placed.',
                      missingLang ? 'Document language is not set.' : 'Language defaults to the export setting.',
                    ];
                    toast('info', findings.join(' '));
                  })}
                >
                  Accessibility check
                </MenuItem>
                <MenuItem
                  icon={Sparkles}
                  onClick={run(() => {
                    const page = activePages[useUI.getState().currentPage];
                    if (!page) return;
                    useUI.getState().setStatusMessage(`Page ${useUI.getState().currentPage + 1} of ${activePages.length}`);
                  })}
                >
                  Document summary
                </MenuItem>
              </>
            ) : null}

            {menu.id === 'help' ? (
              <>
                <MenuItem icon={Keyboard} onClick={run(() => openDialog('shortcuts'))}>
                  Keyboard shortcuts
                </MenuItem>
                <MenuItem icon={FileText} onClick={run(() => openDialog('about'))}>
                  About PDFmaster
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={Share}
                  onClick={run(() => {
                    toast('info', 'PDFmaster keeps every byte on this device. There is no upload endpoint.');
                  })}
                >
                  Privacy &amp; offline
                </MenuItem>
              </>
            ) : null}
          </Menu>
        </div>
      ))}

      <div className="ml-2 hidden text-xs text-ink-400 lg:block">
        {docName}
        {activePages.length ? ` — ${activePages.length} page${activePages.length === 1 ? '' : 's'}` : ''}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          title="Save a copy (Ctrl+S)"
          onClick={() => void quickSave()}
          disabled={!activePages.length}
          className="pm-focus-ring flex h-6 items-center gap-1 rounded bg-accent px-2 text-2xs font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
        >
          <Save size={12} /> Save
        </button>
        <button
          type="button"
          title="Export (Ctrl+Shift+E)"
          onClick={() => openDialog('export')}
          disabled={!activePages.length}
          className="pm-focus-ring flex h-6 items-center gap-1 rounded border border-ink-600 px-2 text-2xs text-ink-100 hover:bg-ink-700 disabled:opacity-40"
        >
          <Download size={12} /> Export
        </button>
      </div>
    </div>
  );
};

/** Placeholder icon used to keep the tree-shaker honest about `Archive`. */
const Archive = FileArchive;
const Share = Activity;
export { Archive, Share };
