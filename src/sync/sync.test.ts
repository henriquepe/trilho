import { describe, expect, it } from 'vitest';
import { addComment, addIssue, addLabel, addTeam, deleteIssue, deleteTeam, emptyState, updateIssue, updateTeam } from '../model';
import type { AppState } from '../types';
import type { CloudClient } from './cloud';
import { createCloudSync, type SyncStatus } from './engine';
import { mergeWorkspaces } from './merge';

function seed() {
  let state = addTeam(emptyState(), { name: 'Aplicativo', key: 'APP' }).state;
  const team = state.teams[0];
  for (const title of ['Login', 'Onboarding', 'Pagamento']) state = addIssue(state, { teamId: team.id, title }).state;
  return state;
}
const issue = (state: AppState, n: number) => state.issues.find((i) => i.number === n)!;
const teamId = (state: AppState) => state.teams[0].id;

describe('mergeWorkspaces', () => {
  it('keeps edits to different fields of the same issue', () => {
    const base = seed();
    const local = updateIssue(base, issue(base, 1).id, { title: 'Login com Google' });
    const remote = addComment(base, issue(base, 1).id, { author: 'Bot', body: 'Reproduzido' });
    const merged = mergeWorkspaces(base, local, remote);
    expect(issue(merged, 1).title).toBe('Login com Google');
    expect(issue(merged, 1).comments.map((c) => c.body)).toEqual(['Reproduzido']);
  });

  it('lets the local edit win a true conflict', () => {
    const base = seed();
    const local = updateIssue(base, issue(base, 2).id, { status: 'done' });
    const remote = updateIssue(base, issue(base, 2).id, { status: 'in_progress' });
    expect(issue(mergeWorkspaces(base, local, remote), 2).status).toBe('done');
  });

  it('applies deletions from either side, unless the other side edited the record', () => {
    const base = seed();
    const local = deleteIssue(base, issue(base, 1).id);
    const remote = updateIssue(deleteIssue(base, issue(base, 2).id), issue(base, 1).id, { priority: 1 });
    const merged = mergeWorkspaces(base, local, remote);
    expect(merged.issues.map((i) => i.number).sort()).toEqual([1, 3]);
    expect(issue(merged, 1).priority).toBe(1);
  });

  it('renumbers an issue created on both sides with the same number', () => {
    const base = seed();
    const local = addIssue(base, { teamId: teamId(base), title: 'Feito aqui' }).state;
    const remote = addIssue(base, { teamId: teamId(base), title: 'Feito pelo bot' }).state;
    const merged = mergeWorkspaces(base, local, remote);
    expect(merged.issues.find((i) => i.title === 'Feito pelo bot')!.number).toBe(4);
    expect(merged.issues.find((i) => i.title === 'Feito aqui')!.number).toBe(5);
    expect(merged.teams[0].nextNumber).toBe(6);
  });

  it('drops issues added to a backlog deleted on the other side, and stale labels', () => {
    const base = addLabel(seed(), { name: 'bug' }).state;
    const label = base.labels[0];
    const local = deleteTeam(base, teamId(base));
    const remote = updateIssue(base, issue(base, 1).id, { labelIds: [label.id] });
    expect(mergeWorkspaces(base, local, remote).issues).toEqual([]);

    const withoutLabel = { ...base, labels: [] };
    expect(issue(mergeWorkspaces(base, withoutLabel, remote), 1).labelIds).toEqual([]);
  });

  it('without a common copy keeps everything and the newer issue wins', async () => {
    const base = seed();
    const local = addIssue(updateTeam(base, teamId(base), { name: 'App', key: 'APP', color: '#000' }), {
      teamId: teamId(base),
      title: 'Só aqui',
    }).state;
    await new Promise((r) => setTimeout(r, 5));
    const remote = updateIssue(base, issue(base, 3).id, { title: 'Pagamento via Pix' });
    const merged = mergeWorkspaces(undefined, local, remote);
    expect(merged.teams[0].name).toBe('App');
    expect(issue(merged, 3).title).toBe('Pagamento via Pix');
    expect(merged.issues.some((i) => i.title === 'Só aqui')).toBe(true);
  });

  it('returns the remote copy untouched when nothing changed locally', () => {
    const base = seed();
    const remote = updateIssue(base, issue(base, 1).id, { title: 'x' });
    expect(mergeWorkspaces(base, base, remote)).toBe(remote);
  });
});

/** Server stand-in with real ETag checks; `other` simulates a bot writing in between. */
function fakeServer(initial: AppState | null) {
  let state = initial;
  let version = initial ? 1 : 0;
  const calls: string[] = [];
  const client: CloudClient = {
    async get(etag) {
      calls.push('get');
      if (!state) return { status: 'missing' };
      if (etag === `v${version}`) return { status: 'unchanged' };
      return { status: 'ok', state, etag: `v${version}` };
    },
    async put(next, etag) {
      calls.push('put');
      if (etag === null ? state !== null : etag !== `v${version}`) return { status: 'conflict' };
      state = JSON.parse(JSON.stringify(next));
      version++;
      return { status: 'ok', etag: `v${version}` };
    },
  };
  return {
    client,
    calls,
    current: () => state!,
    other(change: (s: AppState) => AppState) {
      state = change(state!);
      version++;
    },
  };
}

function app(server: ReturnType<typeof fakeServer>) {
  let local = emptyState();
  const statuses: SyncStatus[] = [];
  const sync = createCloudSync(server.client, {
    getLocal: () => local,
    setLocal: (s) => (local = s),
    onStatus: (s) => statuses.push(s),
  });
  return {
    sync,
    statuses,
    get: () => local,
    edit: (change: (s: AppState) => AppState) => (local = change(local)),
    async start() {
      const started = await sync.start();
      if (started && 'state' in started) local = started.state;
    },
  };
}

describe('createCloudSync', () => {
  it('pushes local edits and pulls bot edits without losing either', async () => {
    const server = fakeServer(seed());
    const a = app(server);
    await a.start();

    a.edit((s) => updateIssue(s, issue(s, 1).id, { status: 'done' }));
    server.other((s) => addComment(s, issue(s, 2).id, { author: 'QA', body: 'ok' }));
    await a.sync.push();

    expect(issue(server.current(), 1).status).toBe('done');
    expect(issue(server.current(), 2).comments).toHaveLength(1);
    expect(issue(a.get(), 2).comments).toHaveLength(1);
    expect(a.statuses.at(-1)?.state).toBe('synced');
  });

  it('polls cheaply when nothing changed', async () => {
    const server = fakeServer(seed());
    const a = app(server);
    await a.start();
    server.calls.length = 0;
    await a.sync.sync();
    expect(server.calls).toEqual(['get']);
  });

  it('uploads the workspace when the cloud has none', async () => {
    const server = fakeServer(null);
    const a = app(server);
    expect(await a.sync.start()).toEqual({ missing: true });
    a.edit(() => seed());
    await a.sync.sync();
    expect(server.current().issues).toHaveLength(3);
  });

  it('reports offline and recovers on the next sync', async () => {
    const server = fakeServer(seed());
    const a = app(server);
    await a.start();
    const realGet = server.client.get;
    server.client.get = async () => {
      const { CloudError } = await import('./cloud');
      throw new CloudError('Sem conexão com a nuvem.');
    };
    await a.sync.sync();
    expect(a.statuses.at(-1)).toEqual({ state: 'offline', message: 'Sem conexão com a nuvem.' });
    server.client.get = realGet;
    await a.sync.sync();
    expect(a.statuses.at(-1)?.state).toBe('synced');
  });
});
