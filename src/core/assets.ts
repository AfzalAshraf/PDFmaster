/** Image assets (placed images, signatures) kept out of the undo snapshots. */
import type { Asset } from './types';
import { dataUrlToUint8, uint8ToDataUrl, uid } from './utils';
import { rasteriseToPng } from './importers';

export async function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
}

export async function assetFromDataUrl(dataUrl: string, options: { name?: string; mime?: string } = {}): Promise<Asset> {
  const mime = options.mime ?? (dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png');
  const bytes = dataUrlToUint8(dataUrl);
  const size = await imageSize(dataUrl);
  return {
    id: uid('asset'),
    dataUrl,
    mime,
    width: size.width,
    height: size.height,
    bytes: bytes.byteLength,
    name: options.name,
  };
}

/**
 * Normalises any browser-decodable image into a PNG/JPEG asset that pdf-lib can
 * embed (SVG, WebP, GIF and BMP are re-encoded through a canvas).
 */
export async function assetFromFile(file: File | Blob, name?: string): Promise<Asset> {
  const declared = file.type || '';
  const isJpeg = declared === 'image/jpeg' || /\.jpe?g$/i.test(name ?? (file as File).name ?? '');
  const isPng = declared === 'image/png' || /\.png$/i.test(name ?? (file as File).name ?? '');
  if (isJpeg || isPng) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const dataUrl = uint8ToDataUrl(bytes, isJpeg ? 'image/jpeg' : 'image/png');
    const size = await imageSize(dataUrl);
    return {
      id: uid('asset'),
      dataUrl,
      mime: isJpeg ? 'image/jpeg' : 'image/png',
      width: size.width,
      height: size.height,
      bytes: bytes.byteLength,
      name: name ?? (file as File).name,
    };
  }
  const png = await rasteriseToPng(file);
  const dataUrl = uint8ToDataUrl(png, 'image/png');
  const size = await imageSize(dataUrl);
  return {
    id: uid('asset'),
    dataUrl,
    mime: 'image/png',
    width: size.width,
    height: size.height,
    bytes: png.byteLength,
    name: name ?? (file as File).name,
  };
}

/** Renders a canvas (e.g. a drawn signature) into an asset. */
export async function assetFromCanvas(canvas: HTMLCanvasElement, name = 'signature.png'): Promise<Asset> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  if (!blob) throw new Error('The signature could not be captured.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const dataUrl = uint8ToDataUrl(bytes, 'image/png');
  return { id: uid('asset'), dataUrl, mime: 'image/png', width: canvas.width, height: canvas.height, bytes: bytes.byteLength, name };
}
