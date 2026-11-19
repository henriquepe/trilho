import { parseState } from '../model';
import type { AppState } from '../types';

// Three-way merge of the workspace: `base` is the copy both sides last agreed on, `local` is
// what this app has now, `remote` is what the server has (written by bots, other machines).
// Records are matched by id and merged field by field, so a bot commenting on an issue and you
// editing its title both survive. Only when both sides changed the same field does the local
// edit (the person at the keyboard) win. An edit always beats a deletion.

type Json = unknown;
type Record_ = { [key: string]: Json };
type WithId = { id: string };

const isObject = (value: Json): value is Record_ =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIdList = (value: Json): value is WithId[] =>
  Array.isArray(value) && value.every((item) => isObject(item) && typeof item.id === 'string');

export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a).filter((k) => a[k] !== undefined);
    const otherKeys = Object.keys(b).filter((k) => b[k] !== undefined);
    return keys.length === otherKeys.length && keys.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

function mergeLists(base: WithId[] | undefined, local: WithId[], remote: WithId[]): WithId[] {
  const byId = (list: WithId[] | undefined) => new Map((list ?? []).map((item) => [item.id, item]));
  const b = byId(base);
  const l = byId(local);
  const r = byId(remote);
  // Remote order first, then what only exists here.
  const ids = [...remote.map((item) => item.id), ...local.map((item) => item.id).filter((id) => !r.has(id))];

  const merged: WithId[] = [];
  for (const id of ids) {
    const was = b.get(id);
    const mine = l.get(id);
    const theirs = r.get(id);
    if (mine && theirs) merged.push(merge3(was, mine, theirs) as WithId);
    else {
      const only = (mine ?? theirs)!;
      // Missing on one side: new there, or deleted here. A deleted record stays deleted
      // unless the other side changed it since.
      if (was === undefined || !deepEqual(only, was)) merged.push(only);
    }
  }
  return merged;
}

export function merge3(base: Json | undefined, local: Json, remote: Json): Json {
  if (deepEqual(local, remote)) return remote;
  if (base !== undefined) {
    if (deepEqual(local, base)) return remote;
    if (deepEqual(remote, base)) return local;
  }

  if (isIdList(local) && isIdList(remote) && (base === undefined || isIdList(base))) {
    return mergeLists(base, local, remote);
  }

  if (isObject(local) && isObject(remote) && (base === undefined || isObject(base))) {
    // Without a common copy (first connection, or offline at startup) the newer record wins whole.
    if (base === undefined && typeof local.updatedAt === 'string' && typeof remote.updatedAt === 'string') {
      return local.updatedAt > remote.updatedAt ? local : remote;
    }
    const merged: Record_ = {};
    for (const key of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const value = merge3(base?.[key], local[key], remote[key]);
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }

  return local;
}

/**
 * Keeps the merged workspace consistent:
 * - issues created on both sides at once can take the same number (APP-7 here and APP-7 there):
 *   the remote one keeps it, the local one moves to the next free number;
 * - an issue added on one side to a backlog deleted on the other goes with the backlog;
 * - labels deleted on one side are removed from issues tagged on the other.
 */
function repair(input: AppState): AppState {
  const teamIds = new Set(input.teams.map((team) => team.id));
  const labelIds = new Set(input.labels.map((label) => label.id));
  let changed = false;
  const issues = input.issues
    .filter((issue) => teamIds.has(issue.teamId) || !(changed = true))
    .map((issue) => {
      const kept = issue.labelIds.filter((id) => labelIds.has(id));
      if (kept.length === issue.labelIds.length) return issue;
      changed = true;
      return { ...issue, labelIds: kept };
    });
  const state = { ...input, issues };
  const teams = state.teams.map((team) => {
    let next = Math.max(
      team.nextNumber,
      issues.reduce((max, issue) => (issue.teamId === team.id ? Math.max(max, issue.number) : max), 0) + 1,
    );
    const seen = new Set<number>();
    issues.forEach((issue, index) => {
      if (issue.teamId !== team.id) return;
      if (seen.has(issue.number)) {
        issues[index] = { ...issue, number: next++ };
        changed = true;
      } else seen.add(issue.number);
    });
    if (next !== team.nextNumber) changed = true;
    return next === team.nextNumber ? team : { ...team, nextNumber: next };
  });
  return changed ? { ...state, teams, issues } : input;
}

export function mergeWorkspaces(base: AppState | undefined, local: AppState, remote: AppState): AppState {
  if (local === remote) return remote;
  if (base !== undefined && local === base) return remote;
  return parseState(repair(merge3(base, local, remote) as AppState));
}
