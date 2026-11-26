// 小さなキー・バリュー保存。PWAではIndexedDB、テストではメモリを使う。
export interface KeyValueStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key);
  }
  async set(key: string, value: string) {
    this.map.set(key, value);
  }
  async delete(key: string) {
    this.map.delete(key);
  }
}

const DB_NAME = "gh-mobile";
const STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbStore implements KeyValueStore {
  private db: Promise<IDBDatabase> | undefined;

  private run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    this.db ??= openDb();
    return this.db.then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(req.result as T);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        }),
    );
  }

  get(key: string) {
    return this.run<string | undefined>("readonly", (s) => s.get(key));
  }
  async set(key: string, value: string) {
    await this.run("readwrite", (s) => s.put(value, key));
  }
  async delete(key: string) {
    await this.run("readwrite", (s) => s.delete(key));
  }
}
