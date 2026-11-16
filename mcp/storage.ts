import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseState } from '../src/model';
import type { AppState } from '../src/types';

const APP_ID = 'com.henriquepires.trilho';

/** Same file the desktop app uses (Tauri's app data dir), unless TRILHO_DATA_FILE overrides it. */
export function dataFilePath(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (env.TRILHO_DATA_FILE) return env.TRILHO_DATA_FILE;
  const home = homedir();
  const base =
    platform === 'darwin'
      ? join(home, 'Library', 'Application Support')
      : platform === 'win32'
        ? (env.APPDATA ?? join(home, 'AppData', 'Roaming'))
        : (env.XDG_DATA_HOME ?? join(home, '.local', 'share'));
  return join(base, APP_ID, 'trilho.json');
}

export function readWorkspace(path: string): AppState {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Dados do Trilho não encontrados em ${path}. Abra o app Trilho uma vez para criá-los ` +
          '(ou aponte TRILHO_DATA_FILE para o arquivo).',
      );
    }
    throw error;
  }
  return parseState(JSON.parse(contents));
}

/** Atomic write (temp file + rename): the app never reads a half-written file. */
export function writeWorkspace(path: string, state: AppState): void {
  const tmp = `${path}.${process.pid}.mcp-tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, path);
}

/**
 * Reads, changes and writes the workspace in one synchronous step, so concurrent
 * edits from the app have the smallest possible window to collide.
 */
export function updateWorkspace<T>(path: string, change: (state: AppState) => { state: AppState; result: T }): T {
  const { state, result } = change(readWorkspace(path));
  writeWorkspace(path, state);
  return result;
}
