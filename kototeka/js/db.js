/**
 * IndexedDB storage for Kototeka
 * Stores full cat profiles, photos, coordinates and metadata offline
 */

const DB_NAME = 'KototekaDB';
const DB_VERSION = 1;
const STORE_NAME = 'cats';

class CatDatabase {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('color', 'color', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async getAllCats() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        // Return sorted newest first
        const cats = request.result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        resolve(cats);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getCatById(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveCat(cat) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      if (!cat.id) {
        cat.id = 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      }
      if (!cat.createdAt) {
        cat.createdAt = new Date().toISOString();
      }

      const request = store.put(cat);
      request.onsuccess = () => resolve(cat);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteCat(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async exportAll() {
    const cats = await this.getAllCats();
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      cats: cats
    }, null, 2);
  }

  async importAll(jsonData) {
    await this.init();
    let data;
    try {
      data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    } catch (e) {
      throw new Error('Некорректный формат файла JSON');
    }

    const catsToImport = Array.isArray(data) ? data : (data.cats || []);
    if (!Array.isArray(catsToImport)) {
      throw new Error('Файл не содержит список котиков');
    }

    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    for (const cat of catsToImport) {
      store.put(cat);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(catsToImport.length);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async clearAll() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
}

// Global instance
window.catDb = new CatDatabase();
