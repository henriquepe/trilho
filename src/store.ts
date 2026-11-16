import { createStore } from './lib/createStore';
import * as model from './model';
import { loadState, saveState } from './persist';
import type { AppState, Project } from './types';

const store = createStore<AppState>(model.emptyState());

let hydrated = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('trilho') : null;

async function persistNow() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  try {
    await saveState(store.get());
    channel?.postMessage('saved');
  } catch (error) {
    console.error('Failed to save state', error);
  }
}

function commit(next: AppState) {
  store.set(next);
  if (!hydrated) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 250);
}

/** Loads the saved workspace (empty on first run). Throws if saved data is unreadable. */
export async function hydrate(): Promise<void> {
  const raw = await loadState();
  store.set(raw === null ? model.emptyState() : model.parseState(raw));
  hydrated = true;
  // Keep other open tabs in sync, and never lose a pending save on close.
  channel?.addEventListener('message', async () => {
    if (saveTimer) return;
    const latest = await loadState();
    if (latest !== null) store.set(model.parseState(latest));
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
