/** Minimal promise wrapper around IndexedDB (no third-party dependency). */

export type UpgradeFn = (db: IDBDatabase, oldVersion: number, tx: IDBTransaction) => void;

export function openDatabase(name: string, version: number, upgrade: UpgradeFn): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      if (!tx) return;
      upgrade(db, event.oldVersion, tx);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the local database.'));
    req.onblocked = () =>
      reject(new Error('The local database is blocked by another open tab. Close other tabs and retry.'));
  });
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local database request failed.'));
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Local database transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Local database transaction aborted.'));
  });
}

export async function getAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  const tx = db.transaction(store, 'readonly');
  const result = await wrap<T[]>(tx.objectStore(store).getAll() as IDBRequest<T[]>);
  return result;
}

export async function getAllByIndex<T>(
  db: IDBDatabase,
  store: string,
  index: string,
  query: IDBKeyRange | IDBValidKey,
): Promise<T[]> {
  const tx = db.transaction(store, 'readonly');
  return wrap<T[]>(tx.objectStore(store).index(index).getAll(query) as IDBRequest<T[]>);
}

export async function getOne<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  const tx = db.transaction(store, 'readonly');
  return wrap<T | undefined>(tx.objectStore(store).get(key) as IDBRequest<T | undefined>);
}

export async function put<T>(db: IDBDatabase, store: string, value: T): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value as unknown as never);
  await txDone(tx);
}

export async function putMany<T>(db: IDBDatabase, store: string, values: T[]): Promise<void> {
  if (values.length === 0) return;
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const value of values) os.put(value as unknown as never);
  await txDone(tx);
}

export async function remove(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

export async function removeMany(db: IDBDatabase, store: string, keys: IDBValidKey[]): Promise<void> {
  if (keys.length === 0) return;
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const key of keys) os.delete(key);
  await txDone(tx);
}

export async function clearStore(db: IDBDatabase, store: string): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await txDone(tx);
}
