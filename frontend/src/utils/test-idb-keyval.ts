const storage = new Map<string, any>();

export default {
  get: (key: string) => Promise.resolve(storage.get(key)),
  set: (key: string, value: any) => {
    storage.set(key, value);
    return Promise.resolve();
  },
  del: (key: string) => {
    storage.delete(key);
    return Promise.resolve();
  },
  clear: () => {
    storage.clear();
    return Promise.resolve();
  },
  keys: () => Promise.resolve(Array.from(storage.keys())),
  values: () => Promise.resolve(Array.from(storage.values())),
  entries: () => Promise.resolve(Array.from(storage.entries()))
};
