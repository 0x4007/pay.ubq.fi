const storage = new Map<string, any>();

export function createIdbKeyval<T>(storeName: string) {
  return {
    async get(key: string): Promise<T | null> {
      return Promise.resolve(storage.get(key) || null);
    },
    async set(key: string, value: T): Promise<void> {
      storage.set(key, value);
      return Promise.resolve();
    },
    async del(key: string): Promise<void> {
      storage.delete(key);
      return Promise.resolve();
    },
    async clear(): Promise<void> {
      storage.clear();
      return Promise.resolve();
    }
  };
}

export const resetDatabase = async (): Promise<void> => {
  storage.clear();
  return Promise.resolve();
};
