import { createStore } from './lib/createStore';
import type { StatusId } from './types';

export interface NewIssueDefaults {
  teamId?: string;
  projectId?: string | null;
  status?: StatusId;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** `danger` (default) for destructive actions, `default` for neutral ones. */
  tone?: 'danger' | 'default';
  /** A notice with a single button and no cancel. */
  notice?: boolean;
}

interface UiState {
  newIssue: NewIssueDefaults | null;
  palette: boolean;
  /** `teamId: null` creates a new team; a string edits that team. */
  teamModal: { teamId: string | null } | null;
  projectModal: boolean;
  cloudModal: boolean;
  confirm: ConfirmRequest | null;
}

const closed: UiState = {
  newIssue: null,
  palette: false,
  teamModal: null,
  projectModal: false,
  cloudModal: false,
  confirm: null,
};

export const ui = createStore<UiState>(closed);

export const openNewIssue = (defaults: NewIssueDefaults = {}) =>
  ui.set({ ...closed, newIssue: defaults });
export const openPalette = () => ui.set({ ...closed, palette: true });
export const openTeamModal = (teamId: string | null = null) =>
  ui.set({ ...closed, teamModal: { teamId } });
export const openProjectModal = () => ui.set({ ...closed, projectModal: true });
export const openCloudModal = () => ui.set({ ...closed, cloudModal: true });
export const askConfirm = (request: ConfirmRequest) => ui.set({ ...closed, confirm: request });
export const closeOverlays = () => ui.set(closed);
export const hasOverlay = () => ui.get() !== closed;

export type ViewMode = 'list' | 'board';
const VIEW_KEY = 'trilho.viewMode';

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

export const viewMode = createStore<ViewMode>(readViewMode());

export function setViewMode(mode: ViewMode) {
  viewMode.set(mode);
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch {
    // Preference only; safe to ignore when storage is unavailable.
  }
}
