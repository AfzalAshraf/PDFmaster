/**
 * Screen <-> PDF coordinate helpers used by the viewer's interaction layer.
 * All maths is centralised here so the viewer, the handles and the exporter
 * agree on where things are.
 */
import {
  applyMatrix,
  invertMatrix,
  localToPdfMatrix,
  localToScreenMatrix,
  mul,
} from '../core/geometry';
import type { Matrix, Point, Rect } from '../core/types';

export interface Box extends Rect {
  rotation: number;
}

/** Composed local -> screen matrix for an object on a page. */
export function objectMatrix(viewportMatrix: Matrix, box: Box): Matrix {
  return localToScreenMatrix(viewportMatrix, box);
}

/** Screen point -> PDF user space point. */
export function screenToPdf(viewportMatrix: Matrix, point: Point): Point {
  return applyMatrix(invertMatrix(viewportMatrix), point);
}

/** Screen point -> the object's local space (0..w, 0..h, y down). */
export function screenToLocal(viewportMatrix: Matrix, box: Box, point: Point): Point {
  const pdf = screenToPdf(viewportMatrix, point);
  return applyMatrix(invertMatrix(localToPdfMatrix(box)), pdf);
}

export function localToPdf(box: Box, point: Point): Point {
  return applyMatrix(localToPdfMatrix(box), point);
}

export function pdfToScreen(viewportMatrix: Matrix, point: Point): Point {
  return applyMatrix(viewportMatrix, point);
}

/**
 * Rebuilds a box so that its *top-left local corner* lands on `anchor` in PDF
 * space, keeping the size and rotation. Solved in closed form:
 *   anchor = center + R(θ)·(-w/2, h/2)  =>  center = anchor - R(θ)·(-w/2, h/2)
 */
export function boxFromAnchor(w: number, h: number, rotation: number, anchor: Point): Box {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = -w / 2;
  const dy = h / 2;
  const rotated = { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  const cx = anchor.x - rotated.x;
  const cy = anchor.y - rotated.y;
  return { x: cx - w / 2, y: cy - h / 2, w, h, rotation };
}

/** Top-left local corner of a box, in PDF space. */
export function boxAnchor(box: Box): Point {
  return localToPdf(box, { x: 0, y: 0 });
}

export function moveBox(box: Box, dx: number, dy: number): Box {
  return { ...box, x: box.x + dx, y: box.y + dy };
}

export interface HandleSpec {
  id: HandleId;
  x: number;
  y: number;
  cursor: string;
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
  rotate: 'grab',
};

/** Handle positions in *screen* space for an object. */
export function handlesFor(viewportMatrix: Matrix, box: Box, minSize = 14): HandleSpec[] {
  const m = objectMatrix(viewportMatrix, box);
  const toScreen = (u: number, v: number) => applyMatrix(m, { x: u, y: v });
  const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const corners = {
    tl: toScreen(0, 0),
    tr: toScreen(box.w, 0),
    br: toScreen(box.w, box.h),
    bl: toScreen(0, box.h),
  };
  const small = Math.max(box.w, box.h) * 0.5 < minSize;
  const specs: HandleSpec[] = [
    { id: 'nw', ...corners.tl, cursor: HANDLE_CURSORS.nw },
    { id: 'ne', ...corners.tr, cursor: HANDLE_CURSORS.ne },
    { id: 'se', ...corners.br, cursor: HANDLE_CURSORS.se },
    { id: 'sw', ...corners.bl, cursor: HANDLE_CURSORS.sw },
  ];
  if (!small) {
    specs.push(
      { id: 'n', ...mid(corners.tl, corners.tr), cursor: HANDLE_CURSORS.n },
      { id: 'e', ...mid(corners.tr, corners.br), cursor: HANDLE_CURSORS.e },
      { id: 's', ...mid(corners.br, corners.bl), cursor: HANDLE_CURSORS.s },
      { id: 'w', ...mid(corners.bl, corners.tl), cursor: HANDLE_CURSORS.w },
    );
  }
  // rotation handle above the top edge
  const top = mid(corners.tl, corners.tr);
  const dir = { x: top.x - mid(corners.bl, corners.br).x, y: top.y - mid(corners.bl, corners.br).y };
  const len = Math.hypot(dir.x, dir.y) || 1;
  specs.push({ id: 'rotate', x: top.x + (dir.x / len) * 22, y: top.y + (dir.y / len) * 22, cursor: HANDLE_CURSORS.rotate });
  return specs;
}

/** Which local edge a handle drags, as a delta on (x, y, w, h) in local space. */
export const HANDLE_AXES: Record<HandleId, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
  rotate: { x: 0, y: 0 },
};

export interface ResizeInput {
  box: Box;
  handle: HandleId;
  pointerLocal: Point;
  shiftKey: boolean;
}

/** Computes the resized box while keeping the opposite corner pinned. */
export function resizeBox({ box, handle, pointerLocal, shiftKey }: ResizeInput): Box {
  const axes = HANDLE_AXES[handle];
  let left = 0;
  let top = 0;
  let right = box.w;
  let bottom = box.h;
  if (axes.x === -1) left = Math.min(pointerLocal.x, right - 4);
  if (axes.x === 1) right = Math.max(pointerLocal.x, left + 4);
  if (axes.y === -1) top = Math.min(pointerLocal.y, bottom - 4);
  if (axes.y === 1) bottom = Math.max(pointerLocal.y, top + 4);

  let w = right - left;
  let h = bottom - top;
  if (shiftKey && axes.x !== 0 && axes.y !== 0) {
    const ratio = box.w / box.h;
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
    if (axes.x === -1) left = right - w;
    if (axes.y === -1) top = bottom - h;
  }
  const anchor = localToPdf(box, { x: left, y: top });
  return boxFromAnchor(w, h, box.rotation, anchor);
}

/** Rotation from a pointer position around the box centre (PDF space). */
export function rotationFromPointer(box: Box, pointerPdf: Point, startAngle: number, startRotation: number, snap: boolean): number {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const angle = (Math.atan2(pointerPdf.y - cy, pointerPdf.x - cx) * 180) / Math.PI;
  let rotation = startRotation + (angle - startAngle);
  if (snap) rotation = Math.round(rotation / 15) * 15;
  return ((rotation % 360) + 360) % 360;
}

export function angleToCenter(box: Box, point: Point): number {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return (Math.atan2(point.y - cy, point.x - cx) * 180) / Math.PI;
}

/** Intersects a drag rectangle with a text quad, producing a sub-quad. */
export function intersectRects(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const top = Math.min(a.y + a.h, b.y + b.h);
  if (right - x < 1 || top - y < 1) return null;
  return { x, y, w: right - x, h: top - y };
}

export const composeViewport = (a: Matrix, b: Matrix) => mul(a, b);
