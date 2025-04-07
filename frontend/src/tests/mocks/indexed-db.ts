const indexedDB = {
  open: () => ({
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
    result: {
      createObjectStore: () => {},
      transaction: () => ({
        objectStore: () => ({
          get: () => ({ onsuccess: null, result: null }),
          put: () => ({ onsuccess: null }),
          delete: () => ({ onsuccess: null }),
          clear: () => ({ onsuccess: null })
        })
      })
    }
  }),
  deleteDatabase: () => ({ onerror: null, onsuccess: null })
};

// Minimal implementations of IDB interfaces
class IDBRequest {}
class IDBOpenDBRequest {}
class IDBDatabase {}
class IDBTransaction {}
class IDBObjectStore {}
class IDBIndex {}
class IDBKeyRange {}

global.indexedDB = indexedDB as any;
global.IDBRequest = IDBRequest as any;
global.IDBOpenDBRequest = IDBOpenDBRequest as any;
global.IDBDatabase = IDBDatabase as any;
global.IDBTransaction = IDBTransaction as any;
global.IDBObjectStore = IDBObjectStore as any;
global.IDBIndex = IDBIndex as any;
global.IDBKeyRange = IDBKeyRange as any;
