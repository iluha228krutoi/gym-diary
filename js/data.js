// Данные приложения в памяти + запись в постоянное хранилище.
//
// При запуске все хранилища загружаются в память (данных у одного человека немного),
// логика работает с памятью синхронно, а каждое изменение тут же уходит в IndexedDB.
// Хранилище подменяемое: в тестах — в памяти, в приложении — IndexedDB (db.js).

export const STORES = ['exercises', 'plans', 'workouts', 'planExercises', 'sessions', 'sets'];

export class Data {
  constructor(persist) {
    this.persist = persist;            // { loadAll(), put(store, obj), delete(store, id), replaceAll(dump) }
    this.tables = {};
    this.meta = {};
    this.pending = Promise.resolve();  // цепочка записей — сохраняем порядок
    this.onError = null;
  }

  async load() {
    const { tables, meta } = await this.persist.loadAll();
    this.tables = {};
    // все хранилища из базы (в т. ч. будущих разделов) + обязательные
    for (const name of new Set([...STORES, ...Object.keys(tables)])) {
      this.tables[name] = new Map((tables[name] || []).map(r => [r.id, r]));
    }
    this.meta = meta || {};
  }

  // ---------- чтение ----------
  all(store) { return [...this.tables[store].values()]; }
  get(store, id) { return this.tables[store].get(id) ?? null; }
  where(store, pred) { return this.all(store).filter(pred); }

  // ---------- запись ----------
  insert(store, obj) {
    const t = this.tables[store];
    let id = 1;
    for (const k of t.keys()) if (k >= id) id = k + 1;
    const row = { ...obj, id };
    t.set(id, row);
    this._write(() => this.persist.put(store, row));
    return row;
  }

  update(store, id, patch) {
    const row = this.tables[store].get(id);
    if (!row) return null;
    Object.assign(row, patch);
    const copy = { ...row };
    this._write(() => this.persist.put(store, copy));
    return row;
  }

  remove(store, id) {
    this.tables[store].delete(id);
    this._write(() => this.persist.delete(store, id));
  }

  setMeta(key, value) {
    this.meta[key] = value;
    this._write(() => this.persist.putMeta(key, value));
  }

  // Транзакция открывается сразу, в момент изменения: IndexedDB сам выполняет их по порядку,
  // а запись не ждёт предыдущие — так меньше шанс потерять данные, если приложение тут же закроют.
  _write(fn) {
    let started;
    try { started = Promise.resolve(fn()); } catch (err) { started = Promise.reject(err); }
    const p = started.catch(err => {
      console.error('Ошибка записи', err);
      if (this.onError) this.onError(err);
    });
    this.pending = Promise.all([this.pending, p]);
  }

  flush() { return this.pending; }

  // ---------- резервная копия ----------
  dump() {
    const tables = {};
    for (const name of Object.keys(this.tables)) tables[name] = this.all(name);
    return { tables, meta: { ...this.meta } };
  }

  async replaceAll(dump) {
    await this.flush();
    await this.persist.replaceAll(dump);
    await this.load();
  }
}

// Хранилище в памяти — для тестов
export class MemoryPersist {
  constructor() { this.tables = {}; this.meta = {}; }
  async loadAll() {
    const tables = {};
    for (const [k, m] of Object.entries(this.tables)) tables[k] = [...m.values()].map(r => ({ ...r }));
    return { tables, meta: { ...this.meta } };
  }
  async put(store, row) { (this.tables[store] ??= new Map()).set(row.id, { ...row }); }
  async delete(store, id) { this.tables[store]?.delete(id); }
  async putMeta(k, v) { this.meta[k] = v; }
  async replaceAll(dump) {
    this.tables = {};
    for (const [k, rows] of Object.entries(dump.tables)) this.tables[k] = new Map(rows.map(r => [r.id, { ...r }]));
    this.meta = { ...dump.meta };
  }
}
