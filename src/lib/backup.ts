import type { DataSnapshot } from '../db/repo';
import { COLLECTION_STORES } from '../db/repo';
import type { StoreName } from '../types/models';
import { RECORD_SCHEMA_VERSION } from '../types/models';
import { isValidISODate, nowInstant } from './date';
import { isRecordId } from './uuid';
import { isFiniteNumber } from './validate';

export const BACKUP_FORMAT = 'personal-life-dashboard-backup';
export const BACKUP_SCHEMA_VERSION = 1;
/** Refuse anything larger than this so a malformed file cannot exhaust memory. */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export interface BackupFile {
  format: string;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  data: Partial<Record<StoreName, unknown[]>>;
}

export function buildBackup(snapshot: DataSnapshot, appVersion = '1.0.0'): BackupFile {
  const data: Partial<Record<StoreName, unknown[]>> = {};
  for (const store of COLLECTION_STORES) data[store] = snapshot[store] as unknown[];
  data.settings = [snapshot.settings];
  data.studyTimer = [snapshot.studyTimer];
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: nowInstant(),
    appVersion,
    data,
  };
}

/* --------------------------------------------------------------- validation */

type Validator = (record: Record<string, unknown>) => boolean;

const hasBase: Validator = (record) =>
  isRecordId(record.id) && typeof record.createdAt === 'string' && typeof record.updatedAt === 'string';

const hasDate: Validator = (record) => hasBase(record) && isValidISODate(record.date) && typeof record.tz === 'string';

const nonNegative = (value: unknown): boolean => value === null || (isFiniteNumber(value) && value >= 0);

const VALIDATORS: Partial<Record<StoreName, Validator>> = {
  targetVersions: (record) =>
    hasBase(record) && isValidISODate(record.effectiveFrom) && typeof record.targets === 'object' && record.targets !== null,
  taskTemplates: (record) => hasBase(record) && typeof record.title === 'string' && typeof record.recurrence === 'object',
  taskInstances: (record) =>
    hasDate(record) &&
    typeof record.title === 'string' &&
    ['pending', 'completed', 'skipped', 'excused', 'cancelled'].includes(String(record.status)),
  foodEntries: (record) =>
    hasDate(record) && typeof record.name === 'string' &&
    nonNegative(record.calories) && nonNegative(record.protein) && nonNegative(record.carbs) && nonNegative(record.fat),
  dayNutrition: (record) => hasDate(record) && ['itemised', 'quick'].includes(String(record.mode)),
  gymSessions: (record) => hasDate(record) && Array.isArray(record.exercises) && nonNegative(record.durationMinutes),
  workoutTemplates: (record) => hasBase(record) && typeof record.name === 'string' && Array.isArray(record.exercises),
  runSessions: (record) => hasDate(record) && nonNegative(record.distanceKm) && nonNegative(record.durationMinutes),
  stepEntries: (record) => hasDate(record) && isFiniteNumber(record.steps) && (record.steps as number) >= 0,
  subjects: (record) => hasBase(record) && typeof record.name === 'string',
  chapters: (record) => hasBase(record) && typeof record.name === 'string' && isRecordId(record.subjectId),
  studySessions: (record) => hasDate(record) && isRecordId(record.subjectId) && nonNegative(record.actualMinutes),
  dayNotes: (record) => hasDate(record),
};

export interface ImportPreview {
  ok: boolean;
  error?: string;
  exportedAt?: string;
  schemaVersion?: number;
  perStore: { store: StoreName; added: number; updated: number; invalid: number }[];
  totals: { added: number; updated: number; invalid: number };
  /** Only the records that passed validation. */
  payload: Partial<Record<StoreName, { id: string }[]>>;
}

/**
 * Validates an uploaded backup against the current schema and reports exactly
 * what an import would do. Nothing is written until the user confirms.
 */
export function previewImport(raw: unknown, snapshot: DataSnapshot): ImportPreview {
  const empty: ImportPreview = { ok: false, perStore: [], totals: { added: 0, updated: 0, invalid: 0 }, payload: {} };

  if (typeof raw !== 'object' || raw === null) {
    return { ...empty, error: 'That file is not a JSON object.' };
  }
  const file = raw as Partial<BackupFile>;
  if (file.format !== BACKUP_FORMAT) {
    return { ...empty, error: 'That file was not exported by this dashboard.' };
  }
  if (typeof file.schemaVersion !== 'number' || file.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return {
      ...empty,
      error: `That backup uses schema version ${String(file.schemaVersion)}, which is newer than this app understands (${BACKUP_SCHEMA_VERSION}).`,
    };
  }
  if (typeof file.data !== 'object' || file.data === null) {
    return { ...empty, error: 'The backup has no data section.' };
  }

  const perStore: ImportPreview['perStore'] = [];
  const payload: Partial<Record<StoreName, { id: string }[]>> = {};
  let added = 0;
  let updated = 0;
  let invalid = 0;

  for (const store of COLLECTION_STORES) {
    const incoming = (file.data as Record<string, unknown>)[store];
    if (!Array.isArray(incoming)) continue;
    const validate = VALIDATORS[store];
    const existingIds = new Set((snapshot[store] as { id: string }[]).map((record) => record.id));
    const accepted: { id: string }[] = [];
    let storeAdded = 0;
    let storeUpdated = 0;
    let storeInvalid = 0;

    for (const candidate of incoming) {
      if (typeof candidate !== 'object' || candidate === null || (validate && !validate(candidate as Record<string, unknown>))) {
        storeInvalid += 1;
        continue;
      }
      const record = { ...(candidate as Record<string, unknown>), v: RECORD_SCHEMA_VERSION } as unknown as { id: string };
      accepted.push(record);
      if (existingIds.has(record.id)) storeUpdated += 1;
      else storeAdded += 1;
    }

    payload[store] = accepted;
    perStore.push({ store, added: storeAdded, updated: storeUpdated, invalid: storeInvalid });
    added += storeAdded;
    updated += storeUpdated;
    invalid += storeInvalid;
  }

  return {
    ok: true,
    exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : undefined,
    schemaVersion: file.schemaVersion,
    perStore,
    totals: { added, updated, invalid },
    payload,
  };
}

/* --------------------------------------------------------------- encryption */

export interface EncryptedBackup {
  format: string;
  encrypted: true;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  exportedAt: string;
}

const PBKDF2_ITERATIONS = 310_000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('This browser does not expose Web Crypto, so encrypted backups are unavailable here.');
  const material = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** AES-GCM with a PBKDF2-derived key. Losing the passphrase means losing the file. */
export async function encryptBackup(backup: BackupFile, passphrase: string): Promise<EncryptedBackup> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(backup));
  const cipher = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, plaintext);
  return {
    format: `${BACKUP_FORMAT}-encrypted`,
    encrypted: true,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(cipher)),
    exportedAt: backup.exportedAt,
  };
}

export function isEncryptedBackup(raw: unknown): raw is EncryptedBackup {
  return (
    typeof raw === 'object' && raw !== null &&
    (raw as EncryptedBackup).encrypted === true &&
    typeof (raw as EncryptedBackup).ciphertext === 'string'
  );
}

export async function decryptBackup(file: EncryptedBackup, passphrase: string): Promise<BackupFile> {
  const key = await deriveKey(passphrase, fromBase64(file.salt));
  try {
    const plain = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(file.iv) as unknown as BufferSource },
      key,
      fromBase64(file.ciphertext) as unknown as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(plain)) as BackupFile;
  } catch {
    throw new Error('Could not decrypt that backup. The passphrase is wrong, or the file has been altered.');
  }
}
