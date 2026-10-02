/** In-app clipboard for objects (copy / cut / paste / duplicate). */
import type { AnyObject, Asset } from '../core/types';
import { uid } from '../core/utils';

interface ClipboardPayload {
  objects: AnyObject[];
  assets: Record<string, Asset>;
}

let payload: ClipboardPayload | null = null;

export function setClipboard(objects: AnyObject[], assets: Record<string, Asset>): void {
  payload = { objects: structuredClone(objects), assets: { ...assets } };
}

export function getClipboard(): ClipboardPayload | null {
  return payload;
}

export function hasClipboard(): boolean {
  return !!payload?.objects.length;
}

/** Re-ids a clipboard payload for pasting onto a page. */
export function instantiateClipboard(pageId: string, offset: { dx: number; dy: number } = { dx: 0, dy: 0 }): {
  objects: AnyObject[];
  assets: Record<string, Asset>;
} | null {
  if (!payload) return null;
  const assets: Record<string, Asset> = {};
  const objects = payload.objects.map((object) => {
    const copy = structuredClone(object);
    copy.id = uid('obj');
    copy.pageId = pageId;
    copy.x += offset.dx;
    copy.y += offset.dy;
    const assetId = (copy as { assetId?: string }).assetId;
    if (assetId && payload!.assets[assetId]) {
      const newAssetId = uid('asset');
      assets[newAssetId] = { ...payload!.assets[assetId], id: newAssetId };
      (copy as { assetId?: string }).assetId = newAssetId;
    }
    return copy;
  });
  return { objects, assets };
}
