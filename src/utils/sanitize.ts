/**
 * Client- and server-safe sanitization, URL validation, and export escaping helpers.
 */

const SAFE_HTTP_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Escapes HTML special characters so untrusted strings can never be interpreted as markup.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates that a dynamic URL uses http: or https: (blocks javascript:, data:, vbscript:, etc.).
 */
export function isSafeHttpUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return SAFE_HTTP_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Formats a CSV cell safely, neutralizing formula injection (=, +, -, @, tab, CR)
 * and escaping double quotes per RFC 4180.
 */
export function escapeCsvCell(value: string | number | undefined | null): string {
  const raw = value === undefined || value === null ? '' : String(value);
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

/**
 * Generates a collision-resistant identifier using Web Crypto when available.
 */
export function createSafeId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(performance.now() * 1000).toString(36)}`;
}
