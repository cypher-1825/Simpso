// ============================================================
// database.js — IndexedDB con versionado, transacciones seguras
// ============================================================
const DB_NAME = 'SimpsotecaDB';
const DB_VERSION = 2; // subir versión fuerza onupgradeneeded, preserva datos existentes

export const DB = {
  _db: null,

  async init() {
    if (this._db) return this._db;
    if (!window.indexedDB) {
      throw new Error('IndexedDB no soportado por este navegador');
    }
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // items: películas y series
        if (!db.objectStoreNames.contains('items')) {
          const s = db.createObjectStore('items', { keyPath: 'key' });
          s.createIndex('type', 'type', { unique: false });
          s.createIndex('genre', 'genre', { unique: false });
          s.createIndex('addedAt', 'addedAt', { unique: false });
          s.createIndex('videoUrl', 'videoUrl', { unique: false });
          s.createIndex('title', 'title', { unique: false });
        }
        // config: API keys, preferencias pequeñas
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'key' });
        }
        // favoritos
        if (!db.objectStoreNames.contains('favorites')) {
          db.createObjectStore('favorites', { keyPath: 'key' });
        }
        // progreso de reproducción
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'key' });
        }
        // historial de importaciones
        if (!db.objectStoreNames.contains('imports')) {
          const s = db.createObjectStore('imports', { keyPath: 'id', autoIncrement: true });
          s.createIndex('fecha', 'fecha', { unique: false });
        }
      };

      req.onsuccess = () => {
        this._db = req.result;
        resolve(this._db);
      };
      req.onerror = () => reject(new Error('No se pudo abrir IndexedDB: ' + req.error?.message));
      req.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña'));
    });
  },

  _tx(store, mode = 'readonly') {
    if (!this._db) throw new Error('DB no inicializada. Llama await DB.init() primero.');
    return this._db.transaction(store, mode).objectStore(store);
  },

  // ---- items ----
  getAll() {
    return new Promise((resolve, reject) => {
      try {
        const req = this._tx('items').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  },

  getByType(type) {
    return new Promise((resolve, reject) => {
      try {
        const idx = this._tx('items').index('type');
        const req = idx.getAll(type);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  },

  put(item) {
    return new Promise((resolve, reject) => {
      try {
        const tx = this._db.transaction('items', 'readwrite');
        const req = tx.objectStore('items').put(item);
        req.onsuccess = () => resolve(item);
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
      } catch (e) { reject(e); }
    });
  },

  delete(key) {
    return new Promise((resolve, reject) => {
      try {
        const tx = this._db.transaction('items', 'readwrite');
        tx.objectStore('items').delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) { reject(e); }
    });
  },

  clearItems() {
    return new Promise((resolve, reject) => {
      try {
        const tx = this._db.transaction('items', 'readwrite');
        tx.objectStore('items').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) { reject(e); }
    });
  },

  count() {
    return new Promise((resolve, reject) => {
      try {
        const req = this._tx('items').count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  },

  // ---- config ----
  getConfig(key) {
    return new Promise((resolve, reject) => {
      try {
        const req = this._tx('config').get(key);
        req.onsuccess = () => resolve(req.result?.value ?? null);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  },

  setConfig(key, value) {
    return new Promise((resolve, reject) => {
      try {
        const tx = this._db.transaction('config', 'readwrite');
        tx.objectStore('config').put({ key, value });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) { reject(e); }
    });
  },

  // ---- favoritos ----
  getFavorites() {
    return new Promise((resolve, reject) => {
      try {
        const req = this._tx('favorites').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  },

  toggleFavorite(item) {
    return new Promise((resolve, reject) => {
      try {
        const tx = this._db.transaction('favorites', 'readwrite');
        const store = tx.objectStore('favorites');
        const getReq = store.get(item.key);
        getReq.onsuccess = () => {
          if (getReq.result) {
            store.delete(item.key);
            tx.oncomplete = () => resolve(false);
          } else {
            store.put({ key: item.key, item, addedAt: Date.now() });
            tx.oncomplete = () => resolve(true);
          }
        };
      } catch (e) { reject(e); }
    });
  },

  // ---- progreso ----
  getProgress(key) {
    return new Promise((resolve, reject) => {
      try {
        const req = this._tx('progress').get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  },

  setProgress(key, seconds, duration) {
    return new Promise((resolve, reject) => {
      try {
        const tx = this._db.transaction('progress', 'readwrite');
        tx.objectStore('progress').put({ key, seconds, duration, updatedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) { reject(e); }
    });
  },

  getAllProgress() {
    return new Promise((resolve, reject) => {
      try {
        const req = this._tx('progress').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  },

  // ---- historial de importaciones ----
  logImport(entry) {
    return new Promise((resolve, reject) => {
      try {
        const tx = this._db.transaction('imports', 'readwrite');
        tx.objectStore('imports').add({ ...entry, fecha: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) { reject(e); }
    });
  },

  getImportHistory() {
    return new Promise((resolve, reject) => {
      try {
        const req = this._tx('imports').getAll();
        req.onsuccess = () => resolve((req.result || []).sort((a,b) => b.fecha - a.fecha));
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  },

  // ---- backup ----
  async exportarBackup() {
    const items = await this.getAll();
    const config = await new Promise((res, rej) => {
      const r = this._tx('config').getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
    const favorites = await this.getFavorites();
    const progress = await this.getAllProgress();
    return {
      version: DB_VERSION,
      exportado: new Date().toISOString(),
      items,
      config: config.map(c => c.key === 'tmdbApiKey' ? { key: c.key, value: '***OCULTA***' } : c),
      favorites,
      progress
    };
  },

  async importarBackup(data, { incluirConfig = false } = {}) {
    if (!data || !Array.isArray(data.items)) throw new Error('Backup inválido');
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(['items', 'favorites', 'progress'], 'readwrite');
      data.items.forEach(it => tx.objectStore('items').put(it));
      (data.favorites || []).forEach(f => tx.objectStore('favorites').put(f));
      (data.progress || []).forEach(p => tx.objectStore('progress').put(p));
      tx.oncomplete = () => resolve({
        items: data.items.length,
        favorites: (data.favorites || []).length,
        progress: (data.progress || []).length
      });
      tx.onerror = () => reject(tx.error);
    });
  }
};