/**
 * Holds the last file the editor built so a real click can save it.
 * A download started after `await buildPdf` is not a user gesture, and this
 * preview often swallows that click while still toasting "Exported".
 */

export interface StagedFile {
  id: number;
  blob: Blob;
  filename: string;
  url: string;
  bytes: number;
  mime: string;
  warnings: string[];
}

let staged: StagedFile | null = null;
let nextId = 1;

export function stageFile(blob: Blob, filename: string, warnings: string[] = []): StagedFile {
  if (staged) URL.revokeObjectURL(staged.url);
  const url = URL.createObjectURL(blob);
  staged = {
    id: nextId++,
    blob,
    filename,
    url,
    bytes: blob.size,
    mime: blob.type || 'application/octet-stream',
    warnings,
  };
  return staged;
}

export function getStagedFile(): StagedFile | null {
  return staged;
}

export function extensionOf(filename: string): string {
  const match = /\.[A-Za-z0-9]+$/.exec(filename);
  return match ? match[0].toLowerCase() : '';
}

interface WritableStream {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface PickerHandle {
  name: string;
  createWritable: () => Promise<WritableStream>;
}

function savePicker():
  | ((options: {
      suggestedName?: string;
      types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    }) => Promise<PickerHandle>)
  | undefined {
  const candidate = (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  if (typeof candidate !== 'function') return undefined;
  return candidate as (options: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<PickerHandle>;
}

/** Opens the browser folder picker when the page is allowed to. Preview iframes usually are not. */
export async function saveStagedWithPicker(filename: string): Promise<'saved' | 'cancelled' | 'unavailable'> {
  const file = staged;
  const picker = savePicker();
  if (!file || !picker) return 'unavailable';
  const ext = extensionOf(filename) || extensionOf(file.filename) || '.pdf';
  const mime = file.mime || 'application/octet-stream';
  try {
    const handle = await picker({
      suggestedName: filename,
      types: [{ description: 'PDFmaster file', accept: { [mime]: [ext] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(file.blob);
    await writable.close();
    return 'saved';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    return 'unavailable';
  }
}
