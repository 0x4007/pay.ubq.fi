import { test, describe, expect, mock } from 'bun:test';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { JSDOM } from 'jsdom';

// Set up IndexedDB mock
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

// Set up DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost'
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

import { WorkerProvider } from '../context/worker-context';
import { DeveloperLeaderboard } from '../components/developer-leaderboard';

// Mock all database operations to return empty values
mock.module('../utils/idb-keyval', () => ({
  createIdbKeyval: () => ({
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(),
    del: () => Promise.resolve(),
    clear: () => Promise.resolve()
  }),
  resetDatabase: () => Promise.resolve()
}));

// Mock the worker context to avoid actual worker initialization
mock.module('../context/worker-context', () => ({
  WorkerProvider: ({ children }: any) => (
    React.createElement('div', null, children)
  ),
  useWorker: () => ({
    worker: { postMessage: () => {} },
    isWorkerInitialized: true,
    workerError: null
  })
}));

// Mock worker implementation
const mockWorker = {
  postMessage: () => {},
  onmessage: null,
  terminate: () => {}
};

describe('Leaderboard Component', () => {
  test('renders without crashing', () => {
    render(
      React.createElement(
        WorkerProvider,
        {
          worker: mockWorker,
          isWorkerInitialized: true,
          workerError: null
        },
        React.createElement(DeveloperLeaderboard)
      )
    );
    expect(screen.getByText(/leaderboard/i)).toBeTruthy();
  });

  test('displays loading state', () => {
    render(
      React.createElement(
        WorkerProvider,
        {
          worker: null,
          isWorkerInitialized: false,
          workerError: null
        },
        React.createElement(DeveloperLeaderboard)
      )
    );
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  test('shows error message when worker fails', () => {
    render(
      React.createElement(
        WorkerProvider,
        {
          worker: null,
          isWorkerInitialized: false,
          workerError: "Test error"
        },
        React.createElement(DeveloperLeaderboard)
      )
    );
    expect(screen.getByText(/error/i)).toBeTruthy();
  });
});
