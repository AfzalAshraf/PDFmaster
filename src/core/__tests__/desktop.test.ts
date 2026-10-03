import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfmasterDesktopBridge } from '../desktop';
import { downloadBlobObject } from '../utils';

function blobWithArrayBuffer(parts: BlobPart[], bytes: number[]): Blob {
  const blob = new Blob(parts);
  Object.defineProperty(blob, 'arrayBuffer', {
    value: async () => new Uint8Array(bytes).buffer,
  });
  return blob;
}

describe('desktop export bridge', () => {
  let originalBridge: PdfmasterDesktopBridge | undefined;

  beforeEach(() => {
    originalBridge = window.pdfmasterDesktop;
    delete window.pdfmasterDesktop;
  });

  afterEach(() => {
    if (originalBridge) window.pdfmasterDesktop = originalBridge;
    else delete window.pdfmasterDesktop;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends the export bytes to the native save dialog', async () => {
    const saveFile = vi.fn(async (_filename: string, _bytes: ArrayBuffer) => true);
    window.pdfmasterDesktop = { saveFile } as unknown as PdfmasterDesktopBridge;
    const blob = blobWithArrayBuffer([new Uint8Array([37, 80, 68, 70])], [37, 80, 68, 70]);

    const saved = await downloadBlobObject(blob, 'review.pdf');

    expect(saved).toBe(true);
    expect(saveFile).toHaveBeenCalledOnce();
    const [filename, bytes] = saveFile.mock.calls[0];
    expect(filename).toBe('review.pdf');
    expect(Array.from(new Uint8Array(bytes))).toEqual([37, 80, 68, 70]);
  });

  it('preserves cancellation from the native save dialog', async () => {
    const saveFile = vi.fn(async (_filename: string, _bytes: ArrayBuffer) => false);
    window.pdfmasterDesktop = { saveFile } as unknown as PdfmasterDesktopBridge;

    await expect(downloadBlobObject(blobWithArrayBuffer(['pdf'], [112, 100, 102]), 'review.pdf')).resolves.toBe(false);
  });

  it('keeps browser downloads working when the desktop bridge is absent', async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdfmaster-test');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await expect(downloadBlobObject(new Blob(['pdf']), 'review.pdf')).resolves.toBe(true);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    vi.runOnlyPendingTimers();
  });
});
