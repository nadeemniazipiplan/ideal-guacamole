/**
 * Input validation and coercion.
 *
 * All user-entered numbers pass through here so that negative calories,
 * NaN, Infinity, and absurd magnitudes never reach the database.
 */

export interface FieldError {
  field: string;
  message: string;
}

export const LIMITS = {
  calories: 20_000,
  macroGrams: 2_000,
  water: 20_000,
  steps: 200_000,
  minutes: 24 * 60,
  weightKg: 500,
  loadKg: 1_000,
  reps: 1_000,
  sets: 100,
  distanceKm: 500,
  heartRate: 250,
  textShort: 120,
  textLong: 2_000,
  met: 25,
};

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Coerce user input to a number within [min, max]; returns null when unusable. */
export function toNumber(value: unknown, min: number, max: number): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const TAB = 9;
const NEWLINE = 10;
const SPACE = 32;
const DELETE = 127;

/** Replace control characters with spaces, optionally preserving newlines. */
function stripControlCharacters(input: string, keepNewlines: boolean): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? SPACE;
    if (code === NEWLINE && keepNewlines) {
      out += '\n';
    } else if (code < SPACE || code === DELETE) {
      out += code === TAB ? ' ' : ' ';
    } else {
      out += ch;
    }
  }
  return out;
}

/** Trim, strip control characters, and cap the length of single-line free text. */
export function text(value: unknown, maxLength = LIMITS.textShort): string {
  if (typeof value !== 'string') return '';
  return stripControlCharacters(value, false).slice(0, maxLength).trim();
}

/** Multi-line free text: keeps newlines, strips other control characters. */
export function multilineText(value: unknown, maxLength = LIMITS.textLong): string {
  if (typeof value !== 'string') return '';
  return stripControlCharacters(value.replace(/\r\n/g, '\n'), true).slice(0, maxLength).trim();
}

export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function hexColour(value: unknown, fallback: string): string {
  return isHexColour(value) ? value : fallback;
}
