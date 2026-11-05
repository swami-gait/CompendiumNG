// ============================================================
// CompendiumNG Web — IndexedDB Setup
// ============================================================

import {
  IDB_DB_NAME, IDB_VERSION,
  STORE_PROJECTS, STORE_NODES, STORE_LINKS,
  STORE_POSITIONS, STORE_VIEWS, STORE_TAGS, STORE_PREFS,
} from '../core/constants';

let _db: IDBDatabase | null = null;

export async function openDatabase(): Promise<IDBDatabase> {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Projects store
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const ps = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        ps.createIndex('name', 'name', { unique: false });
        ps.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Nodes store
      if (!db.objectStoreNames.contains(STORE_NODES)) {
        const ns = db.createObjectStore(STORE_NODES, { keyPath: 'id' });
        ns.createIndex('type', 'type', { unique: false });
        ns.createIndex('label', 'label', { unique: false });
        ns.createIndex('modifiedAt', 'modifiedAt', { unique: false });
      }

      // Links store
      if (!db.objectStoreNames.contains(STORE_LINKS)) {
        const ls = db.createObjectStore(STORE_LINKS, { keyPath: 'id' });
        ls.createIndex('viewId', 'viewId', { unique: false });
        ls.createIndex('fromNodeId', 'fromNodeId', { unique: false });
        ls.createIndex('toNodeId', 'toNodeId', { unique: false });
      }

      // Node positions store (nodeId__viewId composite)
      if (!db.objectStoreNames.contains(STORE_POSITIONS)) {
        const posp = db.createObjectStore(STORE_POSITIONS, { keyPath: 'id' });
        posp.createIndex('nodeId', 'nodeId', { unique: false });
        posp.createIndex('viewId', 'viewId', { unique: false });
      }

      // Views store
      if (!db.objectStoreNames.contains(STORE_VIEWS)) {
        db.createObjectStore(STORE_VIEWS, { keyPath: 'id' });
      }

      // Tags store
      if (!db.objectStoreNames.contains(STORE_TAGS)) {
        const ts = db.createObjectStore(STORE_TAGS, { keyPath: 'id' });
        ts.createIndex('name', 'name', { unique: false });
      }

      // Preferences store (single record with id='prefs')
      if (!db.objectStoreNames.contains(STORE_PREFS)) {
        db.createObjectStore(STORE_PREFS, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      _db = (event.target as IDBOpenDBRequest).result;
      _db.onversionchange = () => { _db?.close(); _db = null; };
      resolve(_db);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getDB(): Promise<IDBDatabase> {
  return _db ?? openDatabase();
}

// --------------- Generic helpers ---------------

export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetByIndex<T>(
  store: string, indexName: string, value: IDBValidKey
): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut<T>(store: string, value: T): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbPutAll<T>(store: string, values: T[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    let pending = values.length;
    if (pending === 0) { resolve(); return; }
    for (const v of values) {
      const req = os.put(v);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { if (--pending === 0) resolve(); };
    }
  });
}

export async function idbDelete(store: string, key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbDeleteByIndex(
  store: string, indexName: string, value: IDBValidKey
): Promise<void> {
  const items = await idbGetByIndex<{ id: string }>(store, indexName, value);
  for (const item of items) await idbDelete(store, item.id);
}

export async function idbClear(store: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
