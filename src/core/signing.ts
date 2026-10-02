/**
 * Digital signatures (PKCS#7 / PAdES style detached signatures) using a
 * PKCS#12 certificate bundle, entirely client side.
 *
 * Flow: the document is built normally (including the visible signature image),
 * a signature placeholder is injected, and @signpdf fills it with the CMS
 * signature produced from the user's .p12/.pfx file. The result opens in Adobe
 * Acrobat as a signed document ("Signed and all signatures are valid"), and any
 * later modification invalidates the signature — as it should.
 */
import type { Buffer as NodeBuffer } from 'buffer';
import type { Rect } from './types';

export interface SigningIdentity {
  /** .p12 / .pfx bytes. */
  p12: Uint8Array;
  passphrase: string;
}

export interface SignatureAppearance {
  reason?: string;
  location?: string;
  contactInfo?: string;
  name?: string;
  signingTime?: Date;
  /** Widget rectangle in PDF user space (defaults to the existing field). */
  widgetRect?: Rect;
}

type BufferLike = NodeBuffer;

let BufferCtor: { from: (input: Uint8Array | string, enc?: string) => BufferLike } | undefined;

async function ensureBuffer(): Promise<{ from: (input: Uint8Array | string, enc?: string) => BufferLike }> {
  if (BufferCtor) return BufferCtor;
  const mod = await import('buffer');
  BufferCtor = mod.Buffer as unknown as typeof BufferCtor;
  (globalThis as unknown as { Buffer?: unknown }).Buffer ??= BufferCtor;
  return BufferCtor!;
}

export interface SignatureInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  serialNumber: string;
}

/** Reads the certificate metadata from a .p12 so the UI can show who signs. */
export async function inspectP12(p12: Uint8Array, passphrase: string): Promise<SignatureInfo> {
  const forge = await loadForge();
  const binary = forge.util.binary.raw.encode(p12);
  const asn1 = forge.asn1.fromDer(binary);
  const p12Asn1 = forge.pkcs12.pkcs12FromAsn1(asn1, passphrase);
  const bags = p12Asn1.getBags({ bagType: forge.pki.oids.certBag }) ?? {};
  const certBag = (bags[forge.pki.oids.certBag] ?? [])[0];
  const cert = certBag?.cert;
  if (!cert) throw new Error('No certificate found in the PKCS#12 file.');
  return {
    subject: describeName(cert.subject, 'CN'),
    issuer: describeName(cert.issuer, 'CN'),
    validFrom: cert.validity.notBefore.toISOString(),
    validTo: cert.validity.notAfter.toISOString(),
    serialNumber: cert.serialNumber,
  };
}

function describeName(attributes: { getField?: (k: string) => { value?: string } | null; attributes?: Array<{ shortName?: string; value?: string }> }, key: string): string {
  const field = attributes.getField?.(key);
  if (field?.value) return field.value;
  return (attributes.attributes ?? []).map((a) => `${a.shortName}=${a.value}`).join(', ');
}

interface ForgeApi {
  util: { binary: { raw: { encode: (input: Uint8Array) => string } }; createBuffer: (input: string) => unknown };
  asn1: { fromDer: (input: string) => unknown };
  pkcs12: { pkcs12FromAsn1: (asn1: unknown, password: string) => { getBags: (opts: { bagType: string }) => Record<string, Array<{ cert?: CertLike }>> } };
  pki: { oids: Record<string, string> };
}

interface CertLike {
  subject: { getField?: (k: string) => { value?: string } | null; attributes?: Array<{ shortName?: string; value?: string }> };
  issuer: { getField?: (k: string) => { value?: string } | null; attributes?: Array<{ shortName?: string; value?: string }> };
  validity: { notBefore: Date; notAfter: Date };
  serialNumber: string;
}

let forgeCache: ForgeApi | undefined;

async function loadForge(): Promise<ForgeApi> {
  if (forgeCache) return forgeCache;
  const mod = (await import('node-forge')) as unknown as { default?: ForgeApi } & ForgeApi;
  forgeCache = (mod.default ?? mod) as ForgeApi;
  return forgeCache;
}

/** Signs a finished PDF buffer with the given PKCS#12 identity. */
export async function signPdf(
  pdfBytes: Uint8Array,
  identity: SigningIdentity,
  appearance: SignatureAppearance = {},
): Promise<Uint8Array> {
  const BufferImpl = await ensureBuffer();
  const [{ plainAddPlaceholder }, { P12Signer }, signpdfDefault] = await Promise.all([
    import('@signpdf/placeholder-plain'),
    import('@signpdf/signer-p12'),
    import('@signpdf/signpdf'),
  ]);
  const SignPdf = (signpdfDefault as unknown as { default?: new () => { sign: (b: BufferLike, s: unknown) => Promise<BufferLike> } }).default ?? (signpdfDefault as unknown as new () => { sign: (b: BufferLike, s: unknown) => Promise<BufferLike> });
  const buffer = BufferImpl.from(pdfBytes);
  const withPlaceholder = plainAddPlaceholder({
    pdfBuffer: buffer as never,
    reason: appearance.reason || 'Digitally signed with PDFmaster',
    contactInfo: appearance.contactInfo || '',
    name: appearance.name || 'PDFmaster user',
    location: appearance.location || '',
    signingTime: appearance.signingTime,
    signatureLength: 24576,
    appName: 'PDFmaster',
    ...(appearance.widgetRect
      ? {
          widgetRect: [
            appearance.widgetRect.x,
            appearance.widgetRect.y,
            appearance.widgetRect.x + appearance.widgetRect.w,
            appearance.widgetRect.y + appearance.widgetRect.h,
          ],
        }
      : {}),
  });
  const signer = new P12Signer(BufferImpl.from(identity.p12) as never, { passphrase: identity.passphrase });
  const signerInstance = new SignPdf();
  const signed = await signerInstance.sign(withPlaceholder as never, signer);
  return new Uint8Array(signed);
}

/** Basic structural check that a file looks like a PKCS#12 bundle. */
export function looksLikeP12(bytes: Uint8Array): boolean {
  return bytes.length > 100 && bytes[0] === 0x30 && bytes[1] === 0x82;
}
