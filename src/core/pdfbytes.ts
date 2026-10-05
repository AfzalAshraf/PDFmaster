/**
 * PDF byte normalisation.
 *
 * pdf.js transfers the ArrayBuffer it is given into its worker, which detaches
 * the editor's copy and makes later export/print fail with "No PDF header
 * found". Callers must keep their own copy. These helpers also accept the
 * shapes bytes turn into after a JSON round-trip, and strip junk that some
 * scanners write before the %PDF- header.
 */

const HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

export function pdfHeaderOffset(bytes: Uint8Array): number {
  const limit = Math.min(bytes.length, 1024);
  for (let i = 0; i <= limit - HEADER.length; i++) {
    if (HEADER.every((byte, offset) => bytes[i + offset] === byte)) return i;
  }
  return -1;
}

export function hasPdfHeader(bytes: Uint8Array): boolean {
  return pdfHeaderOffset(bytes) >= 0;
}

/** Copies `bytes` and drops any preamble before the PDF header. */
export function stripToPdfHeader(bytes: Uint8Array): Uint8Array {
  const offset = pdfHeaderOffset(bytes);
  if (offset < 0) return bytes.byteLength ? bytes.slice() : bytes;
  return offset === 0 ? bytes.slice() : bytes.slice(offset);
}

function fromBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value.replace(/\s/g, ''));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function fromBinaryString(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0xff;
  return out;
}

function fromNumericRecord(data: object): Uint8Array | null {
  const record = data as Record<string, unknown>;
  const keys = Object.keys(record);
  if (!keys.length || !keys.every((key) => /^\d+$/.test(key))) return null;
  const out = new Uint8Array(keys.length);
  for (const key of keys) {
    const index = Number(key);
    if (index >= out.length) return null;
    const value = Number(record[key]);
    if (!Number.isFinite(value)) return null;
    out[index] = value & 0xff;
  }
  return out;
}

/** Turns whatever was stored for a source into a real byte copy. */
export function asUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) {
    try {
      return data.byteLength ? data.slice() : new Uint8Array();
    } catch {
      return new Uint8Array();
    }
  }
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  if (typeof data === 'string') {
    const decoded = fromBase64(data);
    if (decoded && (hasPdfHeader(decoded) || decoded.byteLength > 16)) return decoded;
    return fromBinaryString(data);
  }
  if (Array.isArray(data) && data.every((item) => typeof item === 'number')) return Uint8Array.from(data);
  if (data && typeof data === 'object') return fromNumericRecord(data) ?? new Uint8Array();
  return new Uint8Array();
}

/** A private copy of PDF bytes, starting at the header when one is present. */
export function normalizePdfBytes(data: unknown): Uint8Array {
  return stripToPdfHeader(asUint8Array(data));
}
