import type { AppState } from '../types';
import type { CloudClient } from './cloud';
import { CloudError } from './cloud';
import { mergeWorkspaces } from './merge';

export type SyncStatus =
  | { state: 'syncing' }
  | { state: 'synced'; at: number }
  | { state: 'offline'; message: string };

export interface SyncHooks {
  /** The workspace as the app has it now (including edits not sent yet). */
  getLocal(): AppState;
  /** Shows a merged workspace in the app. */
  setLocal(state: AppState): void;
  onStatus(status: SyncStatus): void;
}

/**
 * Keeps the app and the hosted workspace in step. `base` is the last copy both sides agreed on;
 * every pull merges remote changes into local ones against it, and every push is conditional
 * on the server still holding that copy. Runs one operation at a time.
 */
export function createCloudSync(client: CloudClient, hooks: SyncHooks) {
  let base: AppState | undefined;
  let etag: string | null = null;
  let queue: Promise<void> = Promise.resolve();

  function absorb(remote: AppState, remoteEtag: string) {
    const local = hooks.getLocal();
    const merged = mergeWorkspaces(base, local, remote);
    base = remote;
    etag = remoteEtag;
    if (merged !== local) hooks.setLocal(merged);
  }

  async function pull(force: boolean) {
    const fetched = await client.get(force ? null : etag);
    if (fetched.status === 'ok') absorb(fetched.state, fetched.etag);
    return fetched.status;
  }

  async function push() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const local = hooks.getLocal();
      if (base !== undefined && local === base) return;
      const written = await client.put(local, etag);
      if (written.status === 'ok') {
        base = local;
        etag = written.etag;
        return;
      }
      // Someone saved first: merge their copy in and try again.
      if ((await pull(true)) === 'missing') {
        etag = null;
        base = undefined;
      }
    }
    throw new CloudError('A nuvem mudou várias vezes seguidas. Tentando de novo em instantes.');
  }

  function run(task: () => Promise<void>) {
    queue = queue.then(async () => {
      hooks.onStatus({ state: 'syncing' });
      try {
        await task();
        hooks.onStatus({ state: 'synced', at: Date.now() });
      } catch (error) {
        console.error('Cloud sync failed', error);
        hooks.onStatus({
          state: 'offline',
          message: error instanceof CloudError ? error.message : 'Falha ao sincronizar com a nuvem.',
        });
      }
    });
    return queue;
  }

  return {
    /** First load. Returns the hosted workspace, or null when it is unreachable or was never uploaded. */
    async start(): Promise<{ state: AppState } | { missing: true } | null> {
      try {
        const fetched = await client.get();
        if (fetched.status === 'ok') {
          base = fetched.state;
          etag = fetched.etag;
          hooks.onStatus({ state: 'synced', at: Date.now() });
          return { state: fetched.state };
        }
        return fetched.status === 'missing' ? { missing: true } : null;
      } catch (error) {
        hooks.onStatus({ state: 'offline', message: error instanceof CloudError ? error.message : String(error) });
        return null;
      }
    },
    /** Pulls remote changes, then sends local ones. Safe to call as often as needed. */
    sync: () =>
      run(async () => {
        await pull(false);
        await push();
      }),
    /** Sends local changes (pulling first only if the server says someone else saved). */
    push: () => run(push),
    get hasBase() {
      return base !== undefined;
    },
  };
}

export type CloudSync = ReturnType<typeof createCloudSync>;
