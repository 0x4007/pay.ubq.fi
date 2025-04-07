// Function to completely delete and recreate the database
export const resetDatabase = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const deleteRequest = indexedDB.deleteDatabase("ubiquityCache");

    deleteRequest.onerror = () => {

      reject(deleteRequest.error);
    };

    deleteRequest.onsuccess = () => {

      // Recreate the database
      dbRequest = createDB();
      resolve();
    };
  });
};

// Original IndexedDB implementation
const createDB = (): IDBOpenDBRequest => {
  const dbName = "ubiquityCache";
  const dbVersion = 2; // Increment version to trigger schema update
  const request = indexedDB.open(dbName, dbVersion);

  request.onerror = () => {

  };

  request.onupgradeneeded = (event) => {
    const db = (event.target as IDBOpenDBRequest).result;
    // Create object stores for different types of cache data
    if (!db.objectStoreNames.contains("githubComments")) {
      db.createObjectStore("githubComments");
    }
    if (!db.objectStoreNames.contains("leaderboard_processed")) {
      db.createObjectStore("leaderboard_processed");
    }
    if (!db.objectStoreNames.contains("userDetails")) {
      db.createObjectStore("userDetails");
    }
    if (!db.objectStoreNames.contains("permitMetadata")) {
      db.createObjectStore("permitMetadata");
    }
  };

  return request;
};

// Initialize the database
let dbRequest = createDB();

export function createIdbKeyval<T>(storeName: string) {
  const getDB = (): Promise<IDBDatabase | null> => {
    return new Promise((resolve) => {
      if (dbRequest.readyState === "done") {
        resolve(dbRequest.result || null);
      } else {
        dbRequest.onsuccess = () => resolve(dbRequest.result || null);
        dbRequest.onerror = () => {

          resolve(null);
        };
      }
    });
  };

  return {
    async get(key: string): Promise<T | null> {
      try {
        const db = await getDB();
        if (!db) return null; // Handle case where DB isn't available
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          const request = store.get(key);

          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
      } catch (error) {

        return null;
      }
    },

    async set(key: string, value: T): Promise<void> {
      try {
        const db = await getDB();
        if (!db) return; // Handle case where DB isn't available
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.put(value, key);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch (error) {

      }
    },

    async del(key: string): Promise<void> {
      try {
        const db = await getDB();
        if (!db) return; // Handle case where DB isn't available
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.delete(key);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch (error) {

      }
    },

    async clear(): Promise<void> {
      try {
        const db = await getDB();
        if (!db) return; // Handle case where DB isn't available
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.clear();

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch (error) {

      }
    }
  };
}
