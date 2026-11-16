// Pure operations behind the MCP tools: each takes the workspace and returns the result
// (and the new workspace, for writes). No I/O here, so everything is unit-tested.

import {
  addComment,
  addIssue,
  addLabel,
  addProject,
  addTeam,
  compareIssues,
  findIssueByKey,
  issueKey,
  normalizeText,
  projectProgress,
  STATUSES,
  subIssues,
  updateIssue,
  updateProject,
  type IssuePatch,
} from '../src/model';
import type { AppState, Issue, Priority, Project, ProjectStatus, StatusId, Team } from '../src/types';

export const STATUS_IDS = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'] as const;
export const PRIORITY_NAMES = ['none', 'urgent', 'high', 'medium', 'low'] as const;
export const PROJECT_STATUS_IDS = ['planned', 'active', 'paused', 'completed', 'canceled'] as const;

export type PriorityName = (typeof PRIORITY_NAMES)[number];

const priorityValue = (name: PriorityName) => PRIORITY_NAMES.indexOf(name) as Priority;
const priorityName = (value: Priority): PriorityName => PRIORITY_NAMES[value];
const isClosed = (status: StatusId) => STATUSES.find((s) => s.id === status)?.closed ?? false;

export interface Change<T> {
  state: AppState;
  result: T;
}

// ---------- Lookups ----------

export function findTeam(state: AppState, ref: string): Team {
  const wanted = normalizeText(ref.trim());
  const team =
    state.teams.find((t) => t.key.toLowerCase() === wanted) ??
    state.teams.find((t) => normalizeText(t.name) === wanted);
  if (!team) {
    const known = state.teams.map((t) => t.key).join(', ') || 'nenhum';
    throw new Error(`Backlog "${ref}" não encontrado. Backlogs: ${known}.`);
  }
  return team;
}

export function findProject(state: AppState, ref: string): Project {
  const exact = state.projects.find((p) => p.id === ref);
  if (exact) return exact;
  const wanted = normalizeText(ref.trim());
  const byName = state.projects.filter((p) => normalizeText(p.name) === wanted);
  const matches = byName.length
    ? byName
    : state.projects.filter((p) => normalizeText(p.name).includes(wanted));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `"${ref}" corresponde a ${matches.length} projetos: ${matches.map((p) => p.name).join('; ')}. Use o nome completo.`,
    );
  }
  throw new Error(`Projeto "${ref}" não encontrado.`);
}

export function findIssue(state: AppState, key: string): Issue {
  const issue = findIssueByKey(state, key.trim());
  if (!issue) throw new Error(`Issue ${key} não encontrada.`);
  return issue;
}

/** Label names to ids, creating labels that do not exist yet. */
function resolveLabels(state: AppState, names: string[]): { state: AppState; ids: string[] } {
  let next = state;
  const ids: string[] = [];
  for (const name of names) {
    const result = addLabel(next, { name });
    next = result.state;
    if (!ids.includes(result.label.id)) ids.push(result.label.id);
  }
  return { state: next, ids };
}

// ---------- Views ----------

export function summarizeIssue(state: AppState, issue: Issue) {
  const parent = issue.parentId ? state.issues.find((i) => i.id === issue.parentId) : undefined;
  return {
    key: issueKey(state, issue),
    title: issue.title,
    status: issue.status,
    priority: priorityName(issue.priority),
    backlog: state.teams.find((t) => t.id === issue.teamId)?.key ?? null,
    project: state.projects.find((p) => p.id === issue.projectId)?.name ?? null,
    labels: issue.labelIds.map((id) => state.labels.find((l) => l.id === id)?.name).filter(Boolean),
    parent: parent ? issueKey(state, parent) : null,
    dueDate: issue.dueDate,
    estimate: issue.estimate,
    updatedAt: issue.updatedAt,
  };
}

export function issueDetails(state: AppState, issue: Issue) {
  return {
    ...summarizeIssue(state, issue),
    description: issue.description,
    createdAt: issue.createdAt,
    subIssues: subIssues(state, issue.id).map((child) => ({
      key: issueKey(state, child),
      title: child.title,
      status: child.status,
    })),
    links: issue.links,
    comments: issue.comments.map(({ author, body, createdAt }) => ({ author, body, createdAt })),
  };
}

export function listBacklogs(state: AppState) {
  return state.teams.map((team) => {
    const issues = state.issues.filter((i) => i.teamId === team.id);
    return {
      key: team.key,
      name: team.name,
      openIssues: issues.filter((i) => !isClosed(i.status)).length,
      totalIssues: issues.length,
    };
  });
}

export function listProjects(state: AppState, args: { status?: ProjectStatus[] } = {}) {
  return state.projects
    .filter((p) => !args.status?.length || args.status.includes(p.status))
    .map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      targetDate: project.targetDate,
      progress: projectProgress(state, project.id),
      description: project.description,
    }));
}

export function listLabels(state: AppState) {
  return state.labels.map((label) => ({
    name: label.name,
    issues: state.issues.filter((i) => i.labelIds.includes(label.id)).length,
  }));
}

export interface SearchArgs {
  text?: string;
  backlog?: string;
  project?: string;
  status?: StatusId[];
  priority?: PriorityName[];
  label?: string;
  includeClosed?: boolean;
  limit?: number;
}

export function searchIssues(state: AppState, args: SearchArgs) {
  const team = args.backlog ? findTeam(state, args.backlog) : undefined;
  const project = args.project ? findProject(state, args.project) : undefined;
  const label = args.label
    ? state.labels.find((l) => normalizeText(l.name) === normalizeText(args.label!))
    : undefined;
  if (args.label && !label) throw new Error(`Etiqueta "${args.label}" não encontrada.`);
  const text = normalizeText(args.text?.trim() ?? '');
  const priorities = args.priority?.map(priorityValue);

  const matches = state.issues
    .filter((issue) => {
      if (team && issue.teamId !== team.id) return false;
      if (project && issue.projectId !== project.id) return false;
      if (label && !issue.labelIds.includes(label.id)) return false;
      if (args.status?.length) {
        if (!args.status.includes(issue.status)) return false;
      } else if (!args.includeClosed && isClosed(issue.status)) {
        return false;
      }
      if (priorities?.length && !priorities.includes(issue.priority)) return false;
      if (text) {
        const haystack = normalizeText(`${issueKey(state, issue)} ${issue.title} ${issue.description}`);
        if (!haystack.includes(text)) return false;
      }
      return true;
    })
    .sort(compareIssues);

  const limit = args.limit ?? 50;
  return {
    total: matches.length,
    issues: matches.slice(0, limit).map((issue) => summarizeIssue(state, issue)),
  };
}

// ---------- Writes ----------

export interface IssueFields {
  title?: string;
  description?: string;
  status?: StatusId;
  priority?: PriorityName;
  /** Project name or id; null removes the project. */
  project?: string | null;
  /** Label names; missing labels are created. Replaces the current labels. */
  labels?: string[];
  /** Parent issue key; null makes it a top-level issue. */
  parent?: string | null;
  dueDate?: string | null;
  estimate?: number | null;
}

function toPatch(state: AppState, fields: IssueFields, self?: Issue): { state: AppState; patch: IssuePatch } {
  let next = state;
  const patch: IssuePatch = {};
  if (fields.title !== undefined) {
    if (!fields.title.trim()) throw new Error('O título não pode ficar vazio.');
    patch.title = fields.title.trim();
  }
  if (fields.description !== undefined) patch.description = fields.description;
  if (fields.status !== undefined) patch.status = fields.status;
  if (fields.priority !== undefined) patch.priority = priorityValue(fields.priority);
  if (fields.project !== undefined) {
    patch.projectId = fields.project === null ? null : findProject(next, fields.project).id;
  }
  if (fields.labels !== undefined) {
    const resolved = resolveLabels(next, fields.labels);
    next = resolved.state;
    patch.labelIds = resolved.ids;
  }
  if (fields.parent !== undefined) {
    if (fields.parent === null) {
      patch.parentId = null;
    } else {
      const parent = findIssue(next, fields.parent);
      if (self && (parent.id === self.id || isDescendant(next, parent, self.id))) {
        throw new Error('Uma issue não pode ser sub-issue dela mesma.');
      }
      patch.parentId = parent.id;
    }
  }
  if (fields.dueDate !== undefined) {
    if (fields.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(fields.dueDate)) {
      throw new Error('Prazo deve estar no formato AAAA-MM-DD.');
    }
    patch.dueDate = fields.dueDate;
  }
  if (fields.estimate !== undefined) {
    if (fields.estimate !== null && fields.estimate < 0) throw new Error('A estimativa não pode ser negativa.');
    patch.estimate = fields.estimate;
  }
  return { state: next, patch };
}

function isDescendant(state: AppState, issue: Issue, ancestorId: string): boolean {
  let current: Issue | undefined = issue;
  for (let depth = 0; current?.parentId && depth < 100; depth++) {
    if (current.parentId === ancestorId) return true;
    current = state.issues.find((i) => i.id === current!.parentId);
  }
  return false;
}

export function createIssue(
  state: AppState,
  args: IssueFields & { backlog: string; title: string },
): Change<ReturnType<typeof issueDetails>> {
  const team = findTeam(state, args.backlog);
  const { state: withLabels, patch } = toPatch(state, args);
  const { state: next, issue } = addIssue(withLabels, {
    teamId: team.id,
    title: args.title,
    description: patch.description,
    status: patch.status,
    priority: patch.priority,
    projectId: patch.projectId,
    labelIds: patch.labelIds,
    estimate: patch.estimate,
    dueDate: patch.dueDate,
    parentId: patch.parentId,
  });
  return { state: next, result: issueDetails(next, issue) };
}

export function editIssue(
  state: AppState,
  args: IssueFields & { key: string; backlog?: string },
): Change<ReturnType<typeof issueDetails>> {
  const issue = findIssue(state, args.key);
  const { state: withLabels, patch } = toPatch(state, args, issue);
  if (args.backlog !== undefined) patch.teamId = findTeam(withLabels, args.backlog).id;
  const next = updateIssue(withLabels, issue.id, patch);
  const updated = next.issues.find((i) => i.id === issue.id)!;
  return { state: next, result: issueDetails(next, updated) };
}

export function commentOnIssue(
  state: AppState,
  args: { key: string; body: string; author: string },
): Change<ReturnType<typeof issueDetails>> {
  const issue = findIssue(state, args.key);
  const next = addComment(state, issue.id, { author: args.author, body: args.body });
  return { state: next, result: issueDetails(next, next.issues.find((i) => i.id === issue.id)!) };
}

export function createBacklog(state: AppState, args: { name: string; key?: string }) {
  const { state: next, team } = addTeam(state, args);
  return { state: next, result: { key: team.key, name: team.name } };
}

export interface ProjectFields {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  targetDate?: string | null;
}

export function createProject(state: AppState, args: ProjectFields & { name: string }) {
  const { state: next, project } = addProject(state, args);
  return { state: next, result: listProjects(next).find((p) => p.id === project.id)! };
}

export function editProject(state: AppState, args: ProjectFields & { project: string }) {
  const project = findProject(state, args.project);
  const { project: _ref, ...fields } = args;
  if (fields.name !== undefined && !fields.name.trim()) throw new Error('O nome do projeto não pode ficar vazio.');
  const next = updateProject(state, project.id, {
    ...fields,
    ...(fields.name !== undefined ? { name: fields.name.trim() } : {}),
  });
  return { state: next, result: listProjects(next).find((p) => p.id === project.id)! };
}
