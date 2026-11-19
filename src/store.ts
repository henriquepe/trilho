import { createStore } from './lib/createStore';
import * as model from './model';
import { loadState, onExternalChange, saveState } from './persist';
import { cloudClient, loadCloudConfig } from './sync/cloud';
import { createCloudSync, type CloudSync, type SyncStatus } from './sync/engine';
import type { AppState, Project } from './types';

const store = createStore<AppState>(model.emptyState());

/** Cloud sync state for the UI: null when the app works only with local data. */
export const cloudStatus = createStore<SyncStatus | null>(null);
let cloud: CloudSync | null = null;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
const POLL_MS = 10_000;

let hydrated = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('trilho') : null;

async function persistNow() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  try {
    // With the cloud on, the local file (or IndexedDB) stays as an offline copy.
    await saveState(store.get());
    channel?.postMessage('saved');
  } catch (error) {
    console.error('Failed to save state', error);
  }
  schedulePush();
}

function schedulePush() {
  if (!cloud) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void cloud?.push(), 400);
}

/** Shows a workspace merged from the cloud and keeps the offline copy current. */
function applyFromCloud(next: AppState) {
  store.set(next);
  void saveState(next).catch((error) => console.error('Failed to save the offline copy', error));
}

async function startCloud(): Promise<AppState | null> {
  const config = loadCloudConfig();
  if (!config) return null;
  cloud = createCloudSync(cloudClient(config), {
    getLocal: store.get,
    setLocal: applyFromCloud,
    onStatus: (status) => cloudStatus.set(status),
  });
  const started = await cloud.start();
  return started && 'state' in started ? started.state : null;
}

/** Pulls and pushes now (also used by the "Sincronizar" button). */
export const syncNow = () => cloud?.sync();

function commit(next: AppState) {
  store.set(next);
  if (!hydrated) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 250);
}

/** Loads the saved workspace (empty on first run). Throws if saved data is unreadable. */
export async function hydrate(): Promise<void> {
  // Cloud mode loads the hosted copy; offline (or never uploaded) it starts from the local copy
  // and merges as soon as the cloud answers.
  const fromCloud = await startCloud();
  if (fromCloud) {
    store.set(fromCloud);
    void saveState(fromCloud).catch((error) => console.error('Failed to save the offline copy', error));
  } else {
    const raw = await loadState();
    store.set(raw === null ? model.emptyState() : model.parseState(raw));
  }
  hydrated = true;
  if (cloud) {
    if (!fromCloud) void cloud.sync();
    setInterval(() => {
      if (document.visibilityState === 'visible' && !saveTimer) void cloud?.sync();
    }, POLL_MS);
    window.addEventListener('focus', () => void cloud?.sync());
  }
  // Keep other open tabs in sync, and never lose a pending save on close.
  channel?.addEventListener('message', async () => {
    if (saveTimer) return;
    const latest = await loadState();
    if (latest !== null) store.set(model.parseState(latest));
  });
  // Desktop app: pick up changes made by the MCP server. A pending local edit wins
  // (it is saved within 250 ms), so the app never discards what the user just typed.
  await onExternalChange((raw) => {
    if (saveTimer) return;
    try {
      store.set(model.parseState(raw));
      schedulePush();
    } catch (error) {
      console.error('Ignored invalid external data', error);
    }
  });
  window.addEventListener('pagehide', () => {
    if (saveTimer) void persistNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) void persistNow();
  });
}

export const useAppState = store.use;
export const getAppState = store.get;

export const actions = {
  addTeam(input: model.TeamInput) {
    const result = model.addTeam(store.get(), input);
    commit(result.state);
    return result.team;
  },
  updateTeam(id: string, patch: model.TeamInput) {
    commit(model.updateTeam(store.get(), id, patch));
  },
  deleteTeam(id: string) {
    commit(model.deleteTeam(store.get(), id));
  },
  addProject(input: model.ProjectInput) {
    const result = model.addProject(store.get(), input);
    commit(result.state);
    return result.project;
  },
  updateProject(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>) {
    commit(model.updateProject(store.get(), id, patch));
  },
  deleteProject(id: string) {
    commit(model.deleteProject(store.get(), id));
  },
  addLabel(name: string) {
    const result = model.addLabel(store.get(), { name });
    commit(result.state);
    return result.label;
  },
  deleteLabel(id: string) {
    commit(model.deleteLabel(store.get(), id));
  },
  addIssue(input: model.IssueInput) {
    const result = model.addIssue(store.get(), input);
    commit(result.state);
    return result.issue;
  },
  updateIssue(id: string, patch: model.IssuePatch) {
    commit(model.updateIssue(store.get(), id, patch));
  },
  deleteIssue(id: string) {
    commit(model.deleteIssue(store.get(), id));
  },
  /** Adds an imported workspace to the current one (see `model.mergeState`). */
  merge(incoming: AppState) {
    const result = model.mergeState(store.get(), incoming);
    commit(result.state);
    return result.summary;
  },
};
