import type {
  AppState,
  Issue,
  Label,
  Priority,
  Project,
  ProjectStatus,
  StatusId,
  Team,
} from './types';

export const STATUSES: readonly { id: StatusId; label: string; closed: boolean }[] = [
  { id: 'backlog', label: 'Backlog', closed: false },
  { id: 'todo', label: 'A fazer', closed: false },
  { id: 'in_progress', label: 'Em andamento', closed: false },
  { id: 'in_review', label: 'Em revisão', closed: false },
  { id: 'done', label: 'Concluída', closed: true },
  { id: 'canceled', label: 'Cancelada', closed: true },
];

export const PRIORITIES: readonly { id: Priority; label: string }[] = [
  { id: 0, label: 'Sem prioridade' },
  { id: 1, label: 'Urgente' },
  { id: 2, label: 'Alta' },
  { id: 3, label: 'Média' },
  { id: 4, label: 'Baixa' },
];

export const PROJECT_STATUSES: readonly { id: ProjectStatus; label: string }[] = [
  { id: 'planned', label: 'Planejado' },
  { id: 'active', label: 'Em andamento' },
  { id: 'paused', label: 'Pausado' },
  { id: 'completed', label: 'Concluído' },
  { id: 'canceled', label: 'Cancelado' },
];

export const COLORS = [
  '#e2733d',
  '#e0a93b',
  '#4cb782',
  '#3fb5a8',
  '#4aa8d8',
  '#6f8bea',
  '#c26fd6',
  '#e06c8f',
  '#9aa0a6',
] as const;

export function emptyState(): AppState {
  return { version: 1, teams: [], projects: [], labels: [], issues: [] };
}

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Lowercases and strips diacritics so "Revisão" matches "revisao". */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function sanitizeTeamKey(key: string): string {
  return normalizeText(key)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

/** Derives a short unique key from a team name: "Produto Web" -> "PW", "Engenharia" -> "ENG". */
export function makeTeamKey(name: string, taken: readonly string[]): string {
  const words = normalizeText(name)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let base =
    words.length >= 2
      ? words
          .map((w) => w[0])
          .join('')
          .slice(0, 4)
      : (words[0] ?? '').slice(0, 3);
  if (base.length < 2) base = (base + 'BL').slice(0, 2);
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}${i}`;
  return key;
}

// ---------- Teams ----------

export interface TeamInput {
  name: string;
  key?: string;
  color?: string;
}

export function addTeam(state: AppState, input: TeamInput): { state: AppState; team: Team } {
  const name = input.name.trim();
  if (!name) throw new Error('O nome do backlog é obrigatório.');
  const taken = state.teams.map((t) => t.key);
  const wanted = sanitizeTeamKey(input.key ?? '');
  if (wanted && taken.includes(wanted)) throw new Error(`A sigla ${wanted} já está em uso.`);
  const team: Team = {
    id: newId(),
    name,
    key: wanted || makeTeamKey(name, taken),
    color: input.color ?? COLORS[state.teams.length % COLORS.length],
    nextNumber: 1,
    createdAt: nowIso(),
  };
  return { state: { ...state, teams: [...state.teams, team] }, team };
}

export function updateTeam(state: AppState, id: string, patch: TeamInput): AppState {
  const name = patch.name.trim();
  if (!name) throw new Error('O nome do backlog é obrigatório.');
  const key = sanitizeTeamKey(patch.key ?? '');
  if (key && state.teams.some((t) => t.id !== id && t.key === key)) {
    throw new Error(`A sigla ${key} já está em uso.`);
  }
  return {
    ...state,
    teams: state.teams.map((t) =>
      t.id === id ? { ...t, name, key: key || t.key, color: patch.color ?? t.color } : t,
    ),
  };
}

/** Deleting a team also deletes every issue in its backlog. */
export function deleteTeam(state: AppState, id: string): AppState {
  return {
    ...state,
    teams: state.teams.filter((t) => t.id !== id),
    issues: state.issues
      .filter((i) => i.teamId !== id)
      .map((i) =>
        i.parentId && !state.issues.some((p) => p.id === i.parentId && p.teamId !== id)
          ? { ...i, parentId: null }
          : i,
      ),
  };
}

// ---------- Projects ----------

export interface ProjectInput {
  name: string;
  description?: string;
  color?: string;
  status?: ProjectStatus;
  targetDate?: string | null;
}

export function addProject(
  state: AppState,
  input: ProjectInput,
): { state: AppState; project: Project } {
  const name = input.name.trim();
  if (!name) throw new Error('O nome do projeto é obrigatório.');
  const project: Project = {
    id: newId(),
    name,
    description: input.description ?? '',
    status: input.status ?? 'planned',
    color: input.color ?? COLORS[(state.projects.length + 3) % COLORS.length],
    targetDate: input.targetDate ?? null,
    createdAt: nowIso(),
  };
  return { state: { ...state, projects: [...state.projects, project] }, project };
}

export function updateProject(
  state: AppState,
  id: string,
  patch: Partial<Omit<Project, 'id' | 'createdAt'>>,
): AppState {
  return {
    ...state,
    projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  };
}

/** Deleting a project keeps its issues, which simply lose the project link. */
export function deleteProject(state: AppState, id: string): AppState {
  return {
    ...state,
    projects: state.projects.filter((p) => p.id !== id),
    issues: state.issues.map((i) => (i.projectId === id ? { ...i, projectId: null } : i)),
  };
}

export function projectProgress(
  state: AppState,
  projectId: string,
): { total: number; done: number; percent: number } {
  const scoped = state.issues.filter((i) => i.projectId === projectId && i.status !== 'canceled');
  const done = scoped.filter((i) => i.status === 'done').length;
  return {
    total: scoped.length,
    done,
    percent: scoped.length ? Math.round((done / scoped.length) * 100) : 0,
  };
}

// ---------- Labels ----------

export function addLabel(
  state: AppState,
  input: { name: string; color?: string },
): { state: AppState; label: Label } {
  const name = input.name.trim();
  if (!name) throw new Error('O nome da etiqueta é obrigatório.');
  const existing = state.labels.find((l) => normalizeText(l.name) === normalizeText(name));
  if (existing) return { state, label: existing };
  const label: Label = {
    id: newId(),
    name,
    color: input.color ?? COLORS[(state.labels.length + 4) % COLORS.length],
  };
  return { state: { ...state, labels: [...state.labels, label] }, label };
}

export function deleteLabel(state: AppState, id: string): AppState {
  return {
    ...state,
    labels: state.labels.filter((l) => l.id !== id),
    issues: state.issues.map((i) =>
      i.labelIds.includes(id) ? { ...i, labelIds: i.labelIds.filter((l) => l !== id) } : i,
    ),
  };
}

// ---------- Issues ----------

export interface IssueInput {
  teamId: string;
  title: string;
  description?: string;
  status?: StatusId;
  priority?: Priority;
  projectId?: string | null;
  labelIds?: string[];
  estimate?: number | null;
  dueDate?: string | null;
  parentId?: string | null;
}

export function addIssue(state: AppState, input: IssueInput): { state: AppState; issue: Issue } {
  const team = state.teams.find((t) => t.id === input.teamId);
  if (!team) throw new Error('Backlog não encontrado.');
  const title = input.title.trim();
  if (!title) throw new Error('O título é obrigatório.');
  const now = nowIso();
  const issue: Issue = {
    id: newId(),
    teamId: team.id,
    number: team.nextNumber,
    title,
    description: input.description ?? '',
    status: input.status ?? 'backlog',
    priority: input.priority ?? 0,
    projectId: input.projectId ?? null,
    labelIds: input.labelIds ?? [],
    estimate: input.estimate ?? null,
    dueDate: input.dueDate ?? null,
    parentId: input.parentId ?? null,
    comments: [],
    links: [],
    createdAt: now,
    updatedAt: now,
  };
  return {
    state: {
      ...state,
      teams: state.teams.map((t) => (t.id === team.id ? { ...t, nextNumber: t.nextNumber + 1 } : t)),
      issues: [...state.issues, issue],
    },
    issue,
  };
}

export type IssuePatch = Partial<Omit<Issue, 'id' | 'number' | 'createdAt' | 'updatedAt'>>;

/** Moving an issue to another team gives it the next number of that team's sequence. */
export function updateIssue(state: AppState, id: string, patch: IssuePatch): AppState {
  const current = state.issues.find((i) => i.id === id);
  if (!current) return state;
  let teams = state.teams;
  let number = current.number;
  if (patch.teamId && patch.teamId !== current.teamId) {
    const target = state.teams.find((t) => t.id === patch.teamId);
    if (!target) throw new Error('Backlog não encontrado.');
    number = target.nextNumber;
    teams = state.teams.map((t) =>
      t.id === target.id ? { ...t, nextNumber: t.nextNumber + 1 } : t,
    );
  }
  return {
    ...state,
    teams,
    issues: state.issues.map((i) =>
      i.id === id ? { ...i, ...patch, number, updatedAt: nowIso() } : i,
    ),
  };
}

/** Deleting an issue keeps its sub-issues, which become top-level issues. */
export function deleteIssue(state: AppState, id: string): AppState {
  return {
    ...state,
    issues: state.issues
      .filter((i) => i.id !== id)
      .map((i) => (i.parentId === id ? { ...i, parentId: null } : i)),
  };
}

export function addComment(
  state: AppState,
  issueId: string,
  input: { author: string; body: string },
): AppState {
  const body = input.body.trim();
  if (!body) throw new Error('O comentário não pode ficar vazio.');
  const now = nowIso();
  const comment = { id: newId(), author: input.author.trim() || 'Trilho', body, createdAt: now };
  return {
    ...state,
    issues: state.issues.map((i) =>
      i.id === issueId ? { ...i, comments: [...i.comments, comment], updatedAt: now } : i,
    ),
  };
}

export function subIssues(state: AppState, parentId: string): Issue[] {
  return state.issues.filter((i) => i.parentId === parentId).sort((a, b) => a.number - b.number);
}

export function issueKey(state: AppState, issue: Issue): string {
  const team = state.teams.find((t) => t.id === issue.teamId);
  return `${team?.key ?? '?'}-${issue.number}`;
}

export function findIssueByKey(state: AppState, key: string): Issue | undefined {
  const match = /^([A-Za-z0-9]+)-(\d+)$/.exec(key);
  if (!match) return undefined;
  const team = state.teams.find((t) => t.key === match[1].toUpperCase());
  if (!team) return undefined;
  const number = Number(match[2]);
  return state.issues.find((i) => i.teamId === team.id && i.number === number);
}

export interface IssueFilter {
  teamId?: string;
  projectId?: string;
  text?: string;
  priorities?: Priority[];
  labelIds?: string[];
  projectIds?: string[];
}

export function filterIssues(state: AppState, filter: IssueFilter): Issue[] {
  const text = normalizeText(filter.text?.trim() ?? '');
  return state.issues.filter((issue) => {
    if (filter.teamId && issue.teamId !== filter.teamId) return false;
    if (filter.projectId && issue.projectId !== filter.projectId) return false;
    if (filter.priorities?.length && !filter.priorities.includes(issue.priority)) return false;
    if (filter.labelIds?.length && !filter.labelIds.some((l) => issue.labelIds.includes(l))) {
      return false;
    }
    if (filter.projectIds?.length && !filter.projectIds.includes(issue.projectId ?? '')) {
      return false;
    }
    if (text) {
      const haystack = normalizeText(`${issueKey(state, issue)} ${issue.title}`);
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}

/** Urgent first, "no priority" last; newest first inside the same priority. */
export function compareIssues(a: Issue, b: Issue): number {
  const pa = a.priority === 0 ? 5 : a.priority;
  const pb = b.priority === 0 ? 5 : b.priority;
  if (pa !== pb) return pa - pb;
  return b.createdAt.localeCompare(a.createdAt);
}

// ---------- Import ----------

/** Validates data coming from storage or from an imported file. Throws on anything unusable. */
export function parseState(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') throw new Error('Arquivo inválido: formato não reconhecido.');
  const data = raw as Record<string, unknown>;
  for (const field of ['teams', 'projects', 'labels', 'issues']) {
    if (!Array.isArray(data[field])) throw new Error(`Arquivo inválido: falta a lista "${field}".`);
  }
  const teams = data.teams as Team[];
  const projects = data.projects as Project[];
  const labels = data.labels as Label[];
  const issues = data.issues as Issue[];
  const teamIds = new Set<string>();
  const issueIds = new Set(issues.map((i) => i?.id));
  for (const team of teams) {
    if (typeof team?.id !== 'string' || typeof team.key !== 'string' || typeof team.name !== 'string') {
      throw new Error('Arquivo inválido: backlog malformado.');
    }
    teamIds.add(team.id);
  }
  for (const issue of issues) {
    if (typeof issue?.id !== 'string' || typeof issue.title !== 'string' || !teamIds.has(issue.teamId)) {
      throw new Error('Arquivo inválido: issue malformada ou sem backlog.');
    }
    if (!STATUSES.some((s) => s.id === issue.status)) {
      throw new Error('Arquivo inválido: status desconhecido.');
    }
  }
  return {
    version: 1,
    teams,
    projects,
    labels,
    issues: issues.map((i) => ({
      ...i,
      labelIds: Array.isArray(i.labelIds) ? i.labelIds : [],
      parentId: typeof i.parentId === 'string' && issueIds.has(i.parentId) ? i.parentId : null,
      comments: Array.isArray(i.comments) ? i.comments : [],
      links: Array.isArray(i.links) ? i.links : [],
    })),
  };
}

export interface MergeSummary {
  teams: number;
  projects: number;
  labels: number;
  added: number;
  updated: number;
}

/**
 * Adds an imported workspace to the current one instead of replacing it.
 * Records are matched by id, so importing the same file twice updates in place.
 * Labels with the same name are reused. A different backlog with the same key is a conflict.
 */
export function mergeState(
  current: AppState,
  incoming: AppState,
): { state: AppState; summary: MergeSummary } {
  const teams = [...current.teams];
  for (const team of incoming.teams) {
    const clash = teams.find((t) => t.key === team.key && t.id !== team.id);
    if (clash) {
      throw new Error(
        `A sigla ${team.key} já é usada pelo backlog “${clash.name}”. Renomeie a sigla antes de importar.`,
      );
    }
    const index = teams.findIndex((t) => t.id === team.id);
    if (index === -1) teams.push(team);
    else teams[index] = { ...team, nextNumber: Math.max(team.nextNumber, teams[index].nextNumber) };
  }

  const projects = [...current.projects];
  for (const project of incoming.projects) {
    const index = projects.findIndex((p) => p.id === project.id);
    if (index === -1) projects.push(project);
    else projects[index] = project;
  }

  const labels = [...current.labels];
  const labelMap = new Map<string, string>();
  let newLabels = 0;
  for (const label of incoming.labels) {
    const existing =
      labels.find((l) => l.id === label.id) ??
      labels.find((l) => normalizeText(l.name) === normalizeText(label.name));
    if (existing) labelMap.set(label.id, existing.id);
    else {
      labels.push(label);
      labelMap.set(label.id, label.id);
      newLabels++;
    }
  }

  const issues = [...current.issues];
  let added = 0;
  let updated = 0;
  for (const raw of incoming.issues) {
    const issue = {
      ...raw,
      labelIds: [...new Set(raw.labelIds.map((id) => labelMap.get(id) ?? id))],
    };
    const clash = issues.find(
      (i) => i.teamId === issue.teamId && i.number === issue.number && i.id !== issue.id,
    );
    if (clash) throw new Error('Arquivo inválido: duas issues diferentes com o mesmo código.');
    const index = issues.findIndex((i) => i.id === issue.id);
    if (index === -1) {
      issues.push(issue);
      added++;
    } else {
      issues[index] = issue;
      updated++;
    }
  }

  // Keep every team's sequence ahead of its highest issue number.
  const merged = teams.map((team) => {
    const highest = issues.reduce((max, i) => (i.teamId === team.id ? Math.max(max, i.number) : max), 0);
    return { ...team, nextNumber: Math.max(team.nextNumber, highest + 1) };
  });

  return {
    state: { version: 1, teams: merged, projects, labels, issues },
    summary: {
      teams: incoming.teams.length,
      projects: incoming.projects.length,
      labels: newLabels,
      added,
      updated,
    },
  };
}
