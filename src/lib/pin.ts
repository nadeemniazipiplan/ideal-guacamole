/**
 * Visual PIN lock.
 *
 * IMPORTANT: this is a screen lock, NOT encryption. The records in IndexedDB
 * stay readable to anyone with access to this browser profile and its files.
 * Use the device passcode for real protection, and the encrypted backup option
 * in Settings if you need an at-rest-protected copy.
 */

const SALT = 'personal-life-dashboard/pin/v1';

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${SALT}:${pin}`);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Fallback for environments without Web Crypto: still not a security
    // boundary, and the UI says so.
    let hash = 0;
    for (const char of `${SALT}:${pin}`) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return `weak-${hash}`;
  }
  const digest = await subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
