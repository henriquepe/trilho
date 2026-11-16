import { describe, expect, it } from 'vitest';
import { addIssue, addProject, addTeam, emptyState } from '../src/model';
import type { AppState } from '../src/types';
import {
  commentOnIssue,
  createIssue,
  editIssue,
  editProject,
  findProject,
  listBacklogs,
  listProjects,
  searchIssues,
} from './tools';

function workspace(): AppState {
  let state = emptyState();
  state = addTeam(state, { name: 'Aplicativo', key: 'APP' }).state;
  state = addTeam(state, { name: 'Estudos', key: 'EST' }).state;
  state = addProject(state, { name: 'Lançamento v2' }).state;
  state = addProject(state, { name: 'Lançamento v2 — site' }).state;
  const app = state.teams[0].id;
  state = addIssue(state, { teamId: app, title: 'Corrigir login', priority: 1, status: 'todo' }).state;
  state = addIssue(state, { teamId: app, title: 'Tela de revisão', priority: 3 }).state;
  state = addIssue(state, { teamId: app, title: 'Antiga', status: 'done' }).state;
  return state;
}

describe('MCP tools', () => {
  it('lists backlogs with open counts', () => {
    expect(listBacklogs(workspace())).toEqual([
      { key: 'APP', name: 'Aplicativo', openIssues: 2, totalIssues: 3 },
      { key: 'EST', name: 'Estudos', openIssues: 0, totalIssues: 0 },
    ]);
  });

  it('searches open issues by default, urgent first, ignoring accents', () => {
    const state = workspace();
    expect(searchIssues(state, {}).issues.map((i) => i.key)).toEqual(['APP-1', 'APP-2']);
    expect(searchIssues(state, { includeClosed: true }).total).toBe(3);
    expect(searchIssues(state, { text: 'revisao' }).issues[0].title).toBe('Tela de revisão');
    expect(searchIssues(state, { status: ['done'] }).issues[0].key).toBe('APP-3');
    expect(searchIssues(state, { priority: ['urgent'] }).total).toBe(1);
  });

  it('creates an issue with project, new labels and parent', () => {
    const { state, result } = createIssue(workspace(), {
      backlog: 'app',
      title: 'Botão de sair',
      project: 'Lançamento v2',
      labels: ['Bug', 'web'],
      parent: 'APP-1',
      priority: 'high',
      dueDate: '2026-12-01',
    });
    expect(result).toMatchObject({
      key: 'APP-4',
      project: 'Lançamento v2',
      labels: ['Bug', 'web'],
      parent: 'APP-1',
      priority: 'high',
      dueDate: '2026-12-01',
      status: 'backlog',
    });
    expect(state.labels).toHaveLength(2);
    expect(state.teams[0].nextNumber).toBe(5);
  });

  it('updates only the fields given and can clear them', () => {
    const created = createIssue(workspace(), { backlog: 'APP', title: 'X', project: 'Lançamento v2', parent: 'APP-1' });
    const { result } = editIssue(created.state, { key: 'APP-4', status: 'in_progress', project: null, parent: null });
    expect(result).toMatchObject({ title: 'X', status: 'in_progress', project: null, parent: null });
  });

  it('moves an issue to another backlog with a new key', () => {
    const { result } = editIssue(workspace(), { key: 'APP-2', backlog: 'Estudos' });
    expect(result.key).toBe('EST-1');
  });

  it('refuses cycles in sub-issues', () => {
    const child = createIssue(workspace(), { backlog: 'APP', title: 'Filha', parent: 'APP-1' });
    expect(() => editIssue(child.state, { key: 'APP-1', parent: 'APP-4' })).toThrow(/dela mesma/);
    expect(() => editIssue(child.state, { key: 'APP-1', parent: 'APP-1' })).toThrow(/dela mesma/);
  });

  it('explains what is missing or ambiguous', () => {
    const state = workspace();
    expect(() => createIssue(state, { backlog: 'XYZ', title: 'a' })).toThrow(/Backlogs: APP, EST/);
    expect(() => findProject(state, 'lançamento')).toThrow(/2 projetos/);
    expect(findProject(state, 'lancamento v2').name).toBe('Lançamento v2');
    expect(() => editIssue(state, { key: 'APP-99', title: 'a' })).toThrow(/APP-99 não encontrada/);
    expect(() => createIssue(state, { backlog: 'APP', title: 'a', dueDate: '01/12/2026' })).toThrow(/AAAA-MM-DD/);
  });

  it('adds comments with the configured author', () => {
    const { result } = commentOnIssue(workspace(), { key: 'APP-1', body: ' Feito no PR #3 ', author: 'Henrique' });
    expect(result.comments).toEqual([expect.objectContaining({ author: 'Henrique', body: 'Feito no PR #3' })]);
  });

  it('updates projects and reports progress', () => {
    let state = workspace();
    state = createIssue(state, { backlog: 'APP', title: 'a', project: 'Lançamento v2', status: 'done' }).state;
    state = createIssue(state, { backlog: 'APP', title: 'b', project: 'Lançamento v2' }).state;
    const { result } = editProject(state, { project: 'Lançamento v2', status: 'active', targetDate: '2027-01-15' });
    expect(result).toMatchObject({ status: 'active', targetDate: '2027-01-15', progress: { done: 1, total: 2, percent: 50 } });
    expect(listProjects(state, { status: ['active'] })).toHaveLength(0);
  });
});
