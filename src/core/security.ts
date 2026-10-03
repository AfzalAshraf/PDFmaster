/** Input sanitisation & password-strength helpers (XSS / protocol safety). */

const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

export function sanitizeUrl(input: string): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  if (/[\u0000-\u001f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // allow bare "example.com" style inputs by assuming https
    try {
      url = new URL(`https://${raw}`);
    } catch {
      return null;
    }
  }
  if (!SAFE_PROTOCOLS.includes(url.protocol.toLowerCase())) return null;
  return url.toString();
}

export function escapeHtml(input: string): string {
  return (input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  suggestions: string[];
}

export function passwordStrength(pw: string): PasswordStrength {
  const suggestions: string[] = [];
  let score = 0;
  if (!pw) return { score: 0, label: 'Empty', suggestions: ['Use at least 8 characters.'] };
  if (pw.length >= 8) score += 1;
  else suggestions.push('Use at least 8 characters.');
  if (pw.length >= 12) score += 1;
  else suggestions.push('12+ characters is much stronger.');
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  else suggestions.push('Mix upper and lower case letters.');
  if (/\d/.test(pw)) score += 1;
  else suggestions.push('Add digits.');
  if (/[^\w\s]/.test(pw)) score += 1;
  else suggestions.push('Add symbols.');
  const unique = new Set(pw).size;
  if (unique < Math.max(4, pw.length * 0.5)) {
    score = Math.max(0, score - 1);
    suggestions.push('Avoid repeated characters.');
  }
  const capped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  return { score: capped, label: labels[capped], suggestions: suggestions.slice(0, 3) };
}

export const INTEGRITY_NOTE =
  'Everything in PDFmaster runs locally on your device. Files are never uploaded to a server.';
