/**
 * URL safety utilities for client-side hardening.
 *
 * React auto-escapes text content in JSX, so `<script>` inside a string
 * won't execute.  The one real vector is href attributes: a `javascript:`
 * scheme in an anchor's href will execute code on click.
 *
 * These helpers ensure only safe schemes reach the DOM.
 */

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Returns true if the URL uses a safe scheme (http, https, mailto, tel).
 * Blank strings and undefined are considered safe (no href rendered).
 * Everything else — javascript:, data:, vbscript:, etc. — is rejected.
 */
export const isSafeUrl = (url: string | undefined | null): boolean => {
  if (!url) return true; // blank/undefined → no href rendered, safe
  const trimmed = url.trim();
  if (!trimmed) return true;

  // Relative URLs are safe (they resolve to the current origin)
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('?')) return true;

  // Check scheme
  try {
    // URL constructor throws on invalid URLs; lowercase for comparison
    const parsed = new URL(trimmed);
    return SAFE_SCHEMES.has(parsed.protocol);
  } catch {
    // Malformed URL — reject it
    return false;
  }
};

/**
 * Sanitize a URL for use in an href attribute.
 * Returns the URL if safe, empty string if unsafe.
 * Safe: http, https, mailto, tel, relative paths, anchors.
 * Unsafe: javascript:, data:, vbscript:, anything malformed.
 */
export const sanitizeUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  return isSafeUrl(url) ? url.trim() : '';
};

/**
 * Validate that an imported JSON object doesn't contain __proto__ or
 * constructor pollution attempts. Returns true if the object is clean.
 */
export const hasNoPrototypeKeys = (obj: unknown): boolean => {
  if (obj === null || typeof obj !== 'object') return true;
  if (Array.isArray(obj)) return obj.every(hasNoPrototypeKeys);
  const keys = Object.keys(obj as Record<string, unknown>);
  if (keys.includes('__proto__') || keys.includes('constructor') || keys.includes('prototype')) {
    return false;
  }
  return Object.values(obj as Record<string, unknown>).every(hasNoPrototypeKeys);
};
