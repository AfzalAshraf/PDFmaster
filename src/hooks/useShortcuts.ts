import { useEffect } from 'react';
import { useDoc } from '../state/store';
import { useUI } from '../state/ui';
import type { ToolId } from '../core/constants';
import { getClipboard, instantiateClipboard, setClipboard } from '../state/clipboard';
import { isEditableTarget, uid } from '../core/utils';
import { printDocument, quickSave } from '../ui/actions';

const TOOL_KEYS: Record<string, ToolId> = {
  v: 'select',
  h: 'hand',
  t: 'text',
  e: 'editText',
  i: 'image',
  r: 'shape',
  d: 'draw',
  u: 'highlight',
  n: 'note',
  s: 'stamp',
  x: 'redact',
};

/** Global keyboard shortcuts — the same set advertised in Help ▸ Shortcuts. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const ui = useUI.getState();
      const doc = useDoc.getState();
      const mod = event.ctrlKey || event.metaKey;

      if (event.key === 'Escape') {
        if (ui.dialog) ui.closeDialog();
        else if (ui.selection.length) ui.clearSelection();
        else ui.setTool('select');
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (mod && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        ui.openDialog('open');
        return;
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void quickSave();
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        ui.openDialog('export');
        return;
      }
      if (mod && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        void printDocument();
        return;
      }
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        ui.setLeftPanel('search');
        return;
      }
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) doc.redo();
        else doc.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        doc.redo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        const page = doc.pages.filter((p) => !p.deleted)[ui.currentPage];
        if (page) ui.setSelection(doc.objectsByPage[page.id] ?? []);
        return;
      }
      if (mod && event.key.toLowerCase() === 'c') {
        const objects = ui.selection.map((id) => doc.objects[id]).filter(Boolean);
        if (objects.length) {
          setClipboard(objects, doc.assets);
          ui.toast('success', `Copied ${objects.length} object(s).`);
        }
        return;
      }
      if (mod && event.key.toLowerCase() === 'x') {
        const objects = ui.selection.map((id) => doc.objects[id]).filter(Boolean);
        if (objects.length) {
          setClipboard(objects, doc.assets);
          doc.removeObjects(objects.map((o) => o.id));
          ui.clearSelection();
        }
        return;
      }
      if (mod && event.key.toLowerCase() === 'v') {
        const page = doc.pages.filter((p) => !p.deleted)[ui.currentPage];
        if (!page || !getClipboard()) return;
        const payload = instantiateClipboard(page.id, { dx: 12, dy: -12 });
        if (!payload) return;
        for (const asset of Object.values(payload.assets)) doc.addAsset(asset);
        useDoc.getState().addObjects(payload.objects);
        ui.setSelection(payload.objects.map((o) => o.id));
        return;
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        const objects = ui.selection.map((id) => doc.objects[id]).filter(Boolean);
        if (!objects.length) return;
        const copies = objects.map((object) => ({
          ...structuredClone(object),
          id: uid('obj'),
          x: object.x + 14,
          y: object.y - 14,
          createdAt: Date.now(),
        }));
        doc.addObjects(copies);
        ui.setSelection(copies.map((c) => c.id));
        return;
      }
      if (mod && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        ui.zoomIn();
        return;
      }
      if (mod && event.key === '-') {
        event.preventDefault();
        ui.zoomOut();
        return;
      }
      if (mod && event.key === '0') {
        event.preventDefault();
        ui.setZoom(1);
        return;
      }
      if (mod && event.key === '1') {
        event.preventDefault();
        useUI.setState({ fitMode: 'width' });
        return;
      }
      if (mod && event.key === '2') {
        event.preventDefault();
        useUI.setState({ fitMode: 'page' });
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!ui.selection.length) return;
        event.preventDefault();
        doc.removeObjects(ui.selection);
        ui.clearSelection();
        return;
      }

      if (event.key === 'PageDown') {
        event.preventDefault();
        ui.goToPage(Math.min(doc.pages.filter((p) => !p.deleted).length - 1, ui.currentPage + 1));
        return;
      }
      if (event.key === 'PageUp') {
        event.preventDefault();
        ui.goToPage(Math.max(0, ui.currentPage - 1));
        return;
      }

      if (event.key === 'F3') {
        event.preventDefault();
        const results = ui.searchResults;
        if (!results.length) return;
        const index = event.shiftKey
          ? (ui.searchCursor - 1 + results.length) % results.length
          : (ui.searchCursor + 1) % results.length;
        ui.setSearchCursor(index);
        ui.goToPage(results[index].pageIndex);
        return;
      }

      if (mod || event.altKey) return;

      /* Arrow-key nudging for the selection. */
      if (ui.selection.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
        doc.updateObjects(
          ui.selection.map((id) => {
            const object = doc.objects[id];
            return { id, patch: { x: object.x + dx, y: object.y + dy } };
          }),
          { history: false },
        );
        return;
      }

      const key = event.key.toLowerCase();
      if (TOOL_KEYS[key] && !event.ctrlKey && !event.metaKey) {
        ui.setTool(TOOL_KEYS[key]);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
