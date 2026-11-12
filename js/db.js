// Постоянное хранилище в IndexedDB с миграциями.
//
// Версия базы = число миграций. Новые миграции ДОБАВЛЯЮТСЯ в конец списка,
// старые никогда не меняются — так у пользователя сохраняются данные при обновлении.

import { STORES } from './data.js';

const DB_NAME = 'gymapp';

const MIGRATIONS = [
  // 1: начальная схема
  (db) => {
    db.createObjectStore('meta', { keyPath: 'key' });
    for (const name of STORES) db.createObjectStore(name, { keyPath: 'id' });
  },
  // Пример будущей миграции (раздел «Питание»):
  // (db) => { db.createObjectStore('foods', { keyPath: 'id' }); },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Транзакция отменена'));
  });
}

export function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    r.onupgradeneeded = (e) => {
      const db = r.result;
      for (let v = e.oldVersion; v < SCHEMA_VERSION; v++) MIGRATIONS[v](db, r.transaction);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('База занята другой вкладкой приложения. Закрой её и обнови страницу.'));
  });
}

export class IdbPersist {
  constructor(db) { this.db = db; }

  async loadAll() {
    const names = [...this.db.objectStoreNames];
    const tx = this.db.transaction(names, 'readonly');
    const tables = {};
    let meta = {};
    for (const name of names) {
      const rows = await req(tx.objectStore(name).getAll());
      if (name === 'meta') meta = Object.fromEntries(rows.map(r => [r.key, r.value]));
      else tables[name] = rows;
    }
    return { tables, meta };
  }

  put(store, row) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(row);
    return done(tx);
  }

  delete(store, id) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    return done(tx);
  }

  putMeta(key, value) {
    return this.put('meta', { key, value });
  }

  // Полная замена данных одной транзакцией: либо всё, либо ничего
  replaceAll(dump) {
    const names = [...this.db.objectStoreNames];
    const tx = this.db.transaction(names, 'readwrite');
    for (const name of names) {
      const store = tx.objectStore(name);
      store.clear();
      if (name === 'meta') {
        for (const [key, value] of Object.entries(dump.meta || {})) store.put({ key, value });
      } else {
        for (const row of dump.tables[name] || []) store.put(row);
      }
    }
    return done(tx);
  }
}
