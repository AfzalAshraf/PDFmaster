import type { Matrix, Point, Quad, Rect } from './types';

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** matrix multiplication: result = m1 · m2 (apply m2 first, then m1). */
export function mul(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export const mulAll = (...ms: Matrix[]): Matrix => ms.reduce((acc, m) => mul(acc, m), IDENTITY);

export const translation = (tx: number, ty: number): Matrix => [1, 0, 0, 1, tx, ty];
export const scaling = (sx: number, sy: number): Matrix => [sx, 0, 0, sy, 0, 0];

export function rotation(deg: number): Matrix {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, 0, 0];
}

export function rotateAbout(cx: number, cy: number, deg: number): Matrix {
  return mulAll(translation(cx, cy), rotation(deg), translation(-cx, -cy));
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function invertMatrix(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return IDENTITY;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
}

/**
 * Local (object box) space -> PDF user space.
 * Local space is a DOM-style box: (0,0) top-left, (w,h) bottom-right, y down.
 * PDF space is y-up, so the base mapping flips y and anchors at the box's
 * lower-left corner (`x`, `y + h`), then the object rotation is applied about
 * the box centre.
 */
export function localToPdfMatrix(o: Rect & { rotation?: number }): Matrix {
  const rot = o.rotation ?? 0;
  const flip = mulAll(translation(o.x, o.y + o.h), scaling(1, -1));
  if (!rot) return flip;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  return mul(rotateAbout(cx, cy, rot), flip);
}

/** local -> PDF -> screen (viewport px). */
export function localToScreenMatrix(viewportTransform: Matrix, o: Rect & { rotation?: number }): Matrix {
  return mul(viewportTransform, localToPdfMatrix(o));
}

/** CSS `matrix(...)` string for a computed affine transform. */
export const toCssMatrix = (m: Matrix) => `matrix(${m.map((v) => round(v, 5)).join(',')})`;

export const round = (v: number, digits = 2): number => {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
};

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

export const rectCenter = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export function rectContains(r: Rect, p: Point, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/** Bounding box of a set of points. */
export function boundsOfPoints(points: Point[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Corners of a rotated rect in PDF space: [bl, br, tr, tl]. */
export function rotatedCorners(r: Rect & { rotation?: number }): Point[] {
  const m = localToPdfMatrix(r);
  return [
    applyMatrix(m, { x: 0, y: r.h }),
    applyMatrix(m, { x: r.w, y: r.h }),
    applyMatrix(m, { x: r.w, y: 0 }),
    applyMatrix(m, { x: 0, y: 0 }),
  ];
}

/** Axis-aligned PDF-space bounding box of the (possibly rotated) object. */
export function boundsOfObject(r: Rect & { rotation?: number }): Rect {
  return boundsOfPoints(rotatedCorners(r));
}

/** Does a PDF-space rect intersect a PDF-space point? */
export function objectContainsPoint(r: Rect & { rotation?: number }, p: Point, pad = 0): boolean {
  const local = applyMatrix(invertMatrix(localToPdfMatrix(r)), p);
  return local.x >= -pad && local.x <= r.w + pad && local.y >= -pad && local.y <= r.h + pad;
}

export function quadToPoints(q: Quad): Point[] {
  return [
    { x: q.x, y: q.y },
    { x: q.x + q.w, y: q.y },
    { x: q.x + q.w, y: q.y + q.h },
    { x: q.x, y: q.y + q.h },
  ];
}

export function pointInQuad(q: Quad, p: Point): boolean {
  return rectContains(q, p);
}

/** Distance from point p to segment ab. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Ramer–Douglas–Peucker polyline simplification (used for ink strokes). */
export function simplifyStroke(points: Point[], tolerance = 0.6): Point[] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > tolerance) {
    const left = simplifyStroke(points.slice(0, index + 1), tolerance);
    const right = simplifyStroke(points.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

/** Scale a stroke so its points stay inside the unit box; returns new box. */
export function normalizeStroke(stroke: Point[]): { stroke: Point[]; rect: Rect } | null {
  if (stroke.length < 2) return null;
  const b = boundsOfPoints(stroke);
  if (b.w === 0 && b.h === 0) return null;
  const strokeNorm = stroke.map((p) => ({
    x: (p.x - b.x) / (b.w || 1),
    y: (p.y - b.y) / (b.h || 1),
  }));
  return { stroke: strokeNorm, rect: b };
}

export const degToRad = (deg: number) => (deg * Math.PI) / 180;
export const radToDeg = (rad: number) => (rad * 180) / Math.PI;

/** Parse a CSS hex/rgb colour to an [r,g,b] tuple in 0..1. */
export function parseColor(input: string): [number, number, number] {
  const s = (input || '').trim();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length === 8) hex = hex.slice(0, 6);
    const n = parseInt(hex, 16);
    if (Number.isNaN(n)) return [0, 0, 0];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map((v) => parseFloat(v));
    return [(parts[0] ?? 0) / 255, (parts[1] ?? 0) / 255, (parts[2] ?? 0) / 255];
  }
  return [0, 0, 0];
}

export function toHex(rgb: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}
