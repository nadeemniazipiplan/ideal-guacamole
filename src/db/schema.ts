import { openDatabase } from './idb';
import type { StoreName } from '../types/models';

export const DB_NAME = 'personal-life-dashboard';
/** Bump this and add a migration step below whenever the object stores change. */
export const DB_VERSION = 1;

interface StoreSpec {
  name: StoreName;
  keyPath: string;
  indexes?: { name: string; keyPath: string | string[]; unique?: boolean }[];
}

export const STORES: StoreSpec[] = [
  { name: 'settings', keyPath: 'id' },
  { name: 'targetVersions', keyPath: 'id', indexes: [{ name: 'effectiveFrom', keyPath: 'effectiveFrom' }] },
  { name: 'taskTemplates', keyPath: 'id', indexes: [{ name: 'archived', keyPath: 'archived' }] },
  {
    name: 'taskInstances',
    keyPath: 'id',
    indexes: [
      { name: 'date', keyPath: 'date' },
      { name: 'templateId', keyPath: 'templateId' },
    ],
  },
  { name: 'foodEntries', keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date' }] },
  { name: 'dayNutrition', keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date', unique: true }] },
  { name: 'gymSessions', keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date' }] },
  { name: 'workoutTemplates', keyPath: 'id' },
  { name: 'runSessions', keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date' }] },
  { name: 'stepEntries', keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date', unique: true }] },
  { name: 'subjects', keyPath: 'id' },
  { name: 'chapters', keyPath: 'id', indexes: [{ name: 'subjectId', keyPath: 'subjectId' }] },
  {
    name: 'studySessions',
    keyPath: 'id',
    indexes: [
      { name: 'date', keyPath: 'date' },
      { name: 'subjectId', keyPath: 'subjectId' },
    ],
  },
  { name: 'studyTimer', keyPath: 'id' },
  { name: 'dayNotes', keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date', unique: true }] },
  { name: 'daySummaries', keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date', unique: true }] },
];

/**
 * Migrations are additive and run in order for every version the database has
 * not yet seen. `oldVersion === 0` means a brand new database.
 */
function migrate(db: IDBDatabase, oldVersion: number, _tx: IDBTransaction): void {
  if (oldVersion < 1) {
    for (const spec of STORES) {
      if (db.objectStoreNames.contains(spec.name)) continue;
      const store = db.createObjectStore(spec.name, { keyPath: spec.keyPath });
      for (const index of spec.indexes ?? []) {
        store.createIndex(index.name, index.keyPath as string, { unique: index.unique ?? false });
      }
    }
  }
  // Future: if (oldVersion < 2) { ... }
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDatabase(DB_NAME, DB_VERSION, migrate);
  return dbPromise;
}

/** Closes the open connection so the database can be deleted or reopened. */
export async function closeDb(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  try {
    (await pending).close();
  } catch {
    // An already-closed or failed connection needs no further handling.
  }
}

export async function deleteDatabase(): Promise<void> {
  const db = await getDb();
  db.close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Could not delete the local database.'));
    req.onblocked = () => resolve();
  });
}
