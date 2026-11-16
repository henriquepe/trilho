import { isDesktopApp } from './lib/desktop';
import { emptyState } from './model';
import type { AppState } from './types';

// Browser: IndexedDB. Desktop app: one JSON file in the app data folder, which the
// Trilho MCP server also reads and writes (see mcp/). IndexedDB still holds the data
// saved by versions before the file existed, and is migrated on first launch.

const DB_NAME = 'trilho';
const STORE_NAME = 'kv';
const STATE_KEY = 'state';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadFromIndexedDb(): Promise<unknown> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function saveToIndexedDb(state: AppState): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(state, STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(command, args);
}

/** Saved workspace (unvalidated), or null on a first run in the browser. */
export async function loadState(): Promise<unknown> {
  if (!isDesktopApp()) return loadFromIndexedDb();
  const contents = await invoke<string | null>('read_state');
  if (contents !== null) return JSON.parse(contents);
  // First launch with file storage: move what older versions kept in IndexedDB into the file.
  const legacy = (await loadFromIndexedDb()) ?? emptyState();
  await invoke('write_state', { contents: JSON.stringify(legacy) });
  return legacy;
}

export async function saveState(state: AppState): Promise<void> {
  if (!isDesktopApp()) return saveToIndexedDb(state);
  await invoke('write_state', { contents: JSON.stringify(state) });
}

/** Desktop app only: calls back with the new data when another process (the MCP server) changes the file. */
export async function onExternalChange(callback: (raw: unknown) => void): Promise<void> {
  if (!isDesktopApp()) return;
  const { listen } = await import('@tauri-apps/api/event');
  await listen<string>('state-changed', (event) => {
    try {
      callback(JSON.parse(event.payload));
    } catch (error) {
      console.error('Ignored an unreadable external change', error);
    }
  });
}
