import '@testing-library/jest-dom';
import { JSDOM } from 'jsdom';

// Set up DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost'
});

// Set up global mocks before anything else
global.indexedDB = {
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
} as unknown as typeof indexedDB;

// Now set up DOM globals
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.document.createElement('div').constructor;
