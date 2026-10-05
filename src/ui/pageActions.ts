/** Page commands shared by the tool bar and the tools panel. */
import { storeIndexFromVisual, useDoc } from '../state/store';
import { useUI } from '../state/ui';

function currentPage() {
  const pages = useDoc.getState().pages.filter((page) => !page.deleted);
  return pages[useUI.getState().currentPage] ?? null;
}

export function useEditText(): void {
  const ui = useUI.getState();
  ui.setTool('editText');
  ui.setStatusMessage('Click a word to edit it. Scanned pages are recognised automatically. Press Enter — the new text stays on the page.');
}

export function useAddText(): void {
  const ui = useUI.getState();
  ui.setTool('text');
  ui.setStatusMessage('Click the page to place a text box.');
}

export function rotateCurrentPage(delta: number): void {
  const page = currentPage();
  if (!page) return;
  useDoc.getState().rotatePages([page.id], delta);
  useUI.getState().toast('info', delta > 0 ? 'Page rotated clockwise. Undo with Ctrl+Z.' : 'Page rotated. Undo with Ctrl+Z.', {
    label: 'Undo',
    run: () => useDoc.getState().undo(),
  });
}

export function deleteCurrentPage(): void {
  const page = currentPage();
  if (!page) return;
  useDoc.getState().deletePages([page.id]);
  useUI.getState().toast('info', 'Page deleted.', { label: 'Undo', run: () => useDoc.getState().undo() });
}

export function duplicateCurrentPage(): void {
  const page = currentPage();
  if (!page) return;
  useDoc.getState().duplicatePages([page.id]);
  useUI.getState().toast('success', 'Page duplicated.');
}

export async function insertBlankPage(): Promise<void> {
  const doc = useDoc.getState();
  const visual = useUI.getState().currentPage;
  const at = doc.pages.length ? storeIndexFromVisual(doc.pages, visual) + 1 : 0;
  await doc.addBlankPage(undefined, at);
  useUI.getState().goToPage(visual + 1);
  useUI.getState().toast('success', 'Blank page inserted after this one.');
}

export function moveCurrentPage(direction: -1 | 1): void {
  const doc = useDoc.getState();
  const visual = useUI.getState().currentPage;
  const active = doc.pages.filter((page) => !page.deleted);
  const next = visual + direction;
  if (next < 0 || next >= active.length) return;
  const from = storeIndexFromVisual(doc.pages, visual);
  const to = storeIndexFromVisual(doc.pages, next);
  doc.movePage(from, to);
  useUI.getState().setCurrentPage(next);
}

export function cropCurrentPage(): void {
  const ui = useUI.getState();
  ui.setTool('crop');
  ui.setStatusMessage('Drag on the page to crop it. The crop is kept when you save a copy.');
}

export function showPageThumbnails(): void {
  const ui = useUI.getState();
  if (ui.leftPanel !== 'thumbs') ui.setLeftPanel('thumbs');
  if (ui.collapsed.left) ui.toggleCollapsed('left');
}

export function showOrganizePages(): void {
  const ui = useUI.getState();
  if (ui.rightPanel !== 'organize') ui.setRightPanel('organize');
  if (ui.collapsed.right) ui.toggleCollapsed('right');
  showPageThumbnails();
}

export function showFillSign(): void {
  const ui = useUI.getState();
  ui.setTool('signature');
  if (ui.rightPanel !== 'sign') ui.setRightPanel('sign');
}

export function showProtect(): void {
  useUI.getState().openDialog('security');
}
