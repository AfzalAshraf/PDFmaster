/**
 * Smoke test: the whole shell renders, a real document can be loaded into the
 * store, and the export pipeline produces bytes from the UI's own build input.
 * This is what catches "it compiles but nothing renders" regressions.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { useDoc } from '../../state/store';
import { useUI } from '../../state/ui';
import { buildInputFromStore, defaultExportOptions } from '../actions';
import { buildPdf } from '../../core/engine';
import { blankSource } from '../../core/importers';
import { STAMPS } from '../../core/constants';

vi.mock('../../core/pdfjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/pdfjs')>();
  return { ...actual, getDocument: vi.fn() };
});

/** Client render (zustand only reports live state outside of SSR). */
function renderApp(): { html: string; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(<App />);
  });
  const html = container.innerHTML;
  return {
    html,
    unmount: () => {
      act(() => root?.unmount());
      container.remove();
    },
  };
}

async function loadBlankDocument(): Promise<void> {
  const source = await blankSource([595.28, 841.89]);
  const doc = useDoc.getState();
  doc.reset();
  doc.addSources([source]);
  doc.setDocName('Smoke test');
}

describe('UI shell', () => {
  beforeEach(() => {
    useDoc.getState().reset();
    useUI.setState({
      tool: 'select',
      selection: [],
      dialog: null,
      leftPanel: 'thumbs',
      rightPanel: 'tools',
      toasts: [],
      busy: { active: false, label: '', progress: 0 },
    });
  });

  it('renders the home shell with no document open', () => {
    const { html, unmount } = renderApp();
    expect(html).toContain('PDFmaster');
    expect(html).toContain('Open PDF');
    expect(html.length).toBeGreaterThan(2000);
    unmount();
  });

  it('renders the full editor chrome once a document exists', async () => {
    await loadBlankDocument();
    useDoc.getState().addObject({
      id: 'obj-text',
      pageId: useDoc.getState().pages[0].id,
      kind: 'textbox',
      x: 72,
      y: 700,
      w: 260,
      h: 40,
      rotation: 0,
      opacity: 1,
      text: 'Hello PDFmaster',
      style: { fontFamily: 'Helvetica', fontSize: 14, color: '#111111' },
      createdAt: Date.now(),
    });
    useDoc.getState().addObject({
      id: 'obj-stamp',
      pageId: useDoc.getState().pages[0].id,
      kind: 'stamp',
      x: 72,
      y: 620,
      w: 150,
      h: 52,
      rotation: 0,
      opacity: 1,
      label: STAMPS[0].label,
      color: STAMPS[0].color,
      variant: 'standard',
      createdAt: Date.now(),
    });

    const { html, unmount } = renderApp();
    expect(html).toContain('data-testid="menubar"');
    expect(html).toContain('data-testid="toolbar"');
    expect(html).toContain('data-testid="viewer"');
    expect(html).toContain('Smoke test');
    unmount();
  });

  it('builds a PDF from the UI store (end to end)', async () => {
    await loadBlankDocument();
    useDoc.getState().addObject({
      id: 'obj-note',
      pageId: useDoc.getState().pages[0].id,
      kind: 'note',
      x: 200,
      y: 640,
      w: 22,
      h: 22,
      rotation: 0,
      opacity: 1,
      text: 'Review this paragraph',
      color: '#ffcc00',
      author: 'Ada',
      createdAt: Date.now(),
    });

    const input = { ...buildInputFromStore(), options: { ...defaultExportOptions(), flattenForms: false } };
    const result = await buildPdf(input);
    expect(result.bytes.byteLength).toBeGreaterThan(800);
    expect(result.stats.pages).toBe(1);
    expect(String.fromCharCode(...result.bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('exposes every menu, panel and dialog id without crashing', () => {
    const ui = useUI.getState();
    expect(ui.setTool).toBeTypeOf('function');
    const menus = ['file', 'edit', 'view', 'document', 'comments', 'forms', 'protect', 'tools', 'help'];
    for (const menu of menus) {
      useUI.setState({ openMenu: menu });
      const { html, unmount } = renderApp();
      expect(html).toContain('menubar');
      unmount();
    }
  });
});
