import { describe, expect, it } from 'vitest';
import {
  addIssue,
  addLabel,
  addProject,
  addTeam,
  compareIssues,
  deleteLabel,
  deleteProject,
  deleteTeam,
  emptyState,
  filterIssues,
  findIssueByKey,
  deleteIssue,
  issueKey,
  makeTeamKey,
  mergeState,
  parseState,
  projectProgress,
  subIssues,
  updateIssue,
  updateTeam,
} from './model';

function twoTeams() {
  const a = addTeam(emptyState(), { name: 'Engenharia' });
  const b = addTeam(a.state, { name: 'Produto Web' });
  return { state: b.state, eng: a.team, web: b.team };
}

describe('team keys', () => {
  it('derives keys from the name and keeps them unique', () => {
    expect(makeTeamKey('Engenharia', [])).toBe('ENG');
    expect(makeTeamKey('Produto Web', [])).toBe('PW');
    expect(makeTeamKey('Engenharia', ['ENG'])).toBe('ENG2');
    expect(makeTeamKey('Ação', [])).toBe('ACA');
    expect(makeTeamKey('!!!', [])).toBe('BL');
  });

  it('rejects a duplicated explicit key on create and update', () => {
    const { state, web } = twoTeams();
    expect(() => addTeam(state, { name: 'Outro', key: 'eng' })).toThrow(/ENG/);
    expect(() => updateTeam(state, web.id, { name: 'Web', key: 'ENG' })).toThrow(/ENG/);
    expect(updateTeam(state, web.id, { name: 'Web', key: 'web' }).teams[1].key).toBe('WEB');
  });
});

describe('issues', () => {
  it('numbers issues independently per team', () => {
    const { state, eng, web } = twoTeams();
    const r1 = addIssue(state, { teamId: eng.id, title: 'A' });
    const r2 = addIssue(r1.state, { teamId: eng.id, title: 'B' });
    const r3 = addIssue(r2.state, { teamId: web.id, title: 'C' });
    expect(issueKey(r3.state, r1.issue)).toBe('ENG-1');
    expect(issueKey(r3.state, r2.issue)).toBe('ENG-2');
    expect(issueKey(r3.state, r3.issue)).toBe('PW-1');
    expect(findIssueByKey(r3.state, 'eng-2')?.id).toBe(r2.issue.id);
    expect(findIssueByKey(r3.state, 'ENG-9')).toBeUndefined();
  });

  it('rejects empty titles and unknown teams', () => {
    const { state, eng } = twoTeams();
    expect(() => addIssue(state, { teamId: eng.id, title: '   ' })).toThrow();
    expect(() => addIssue(state, { teamId: 'nope', title: 'X' })).toThrow();
  });

  it('renumbers an issue moved to another team without reusing numbers', () => {
    const { state, eng, web } = twoTeams();
    const r1 = addIssue(state, { teamId: eng.id, title: 'A' });
    const r2 = addIssue(r1.state, { teamId: web.id, title: 'B' });
    const moved = updateIssue(r2.state, r1.issue.id, { teamId: web.id });
    const issue = moved.issues.find((i) => i.id === r1.issue.id)!;
    expect(issueKey(moved, issue)).toBe('PW-2');
    const next = addIssue(moved, { teamId: eng.id, title: 'C' });
    expect(issueKey(next.state, next.issue)).toBe('ENG-2');
  });

  it('sorts urgent first and no-priority last', () => {
    const { state, eng } = twoTeams();
    const none = addIssue(state, { teamId: eng.id, title: 'none' });
    const low = addIssue(none.state, { teamId: eng.id, title: 'low', priority: 4 });
    const urgent = addIssue(low.state, { teamId: eng.id, title: 'urgent', priority: 1 });
    const titles = [...urgent.state.issues].sort(compareIssues).map((i) => i.title);
    expect(titles).toEqual(['urgent', 'low', 'none']);
  });

  it('filters by scope, text (accent-insensitive), priority, label and project', () => {
    const { state, eng, web } = twoTeams();
    const label = addLabel(state, { name: 'Bug' });
    const project = addProject(label.state, { name: 'Lançamento' });
    let s = project.state;
    s = addIssue(s, {
      teamId: eng.id,
      title: 'Corrigir revisão de login',
      priority: 1,
      labelIds: [label.label.id],
      projectId: project.project.id,
    }).state;
    s = addIssue(s, { teamId: eng.id, title: 'Refatorar store' }).state;
    s = addIssue(s, { teamId: web.id, title: 'Landing page' }).state;

    expect(filterIssues(s, { teamId: eng.id })).toHaveLength(2);
    expect(filterIssues(s, { text: 'REVISAO' })).toHaveLength(1);
    expect(filterIssues(s, { text: 'pw-1' })[0].title).toBe('Landing page');
    expect(filterIssues(s, { priorities: [1] })).toHaveLength(1);
    expect(filterIssues(s, { labelIds: [label.label.id] })).toHaveLength(1);
    expect(filterIssues(s, { projectId: project.project.id })).toHaveLength(1);
    expect(filterIssues(s, { projectIds: [project.project.id] })).toHaveLength(1);
    expect(filterIssues(s, {})).toHaveLength(3);
  });
});

describe('cascades', () => {
  it('deleting a team removes its issues only', () => {
    const { state, eng, web } = twoTeams();
    let s = addIssue(state, { teamId: eng.id, title: 'A' }).state;
    s = addIssue(s, { teamId: web.id, title: 'B' }).state;
    s = deleteTeam(s, eng.id);
    expect(s.teams.map((t) => t.key)).toEqual(['PW']);
    expect(s.issues.map((i) => i.title)).toEqual(['B']);
  });

  it('deleting a project or label keeps the issues and unlinks them', () => {
    const { state, eng } = twoTeams();
    const label = addLabel(state, { name: 'Bug' });
    const project = addProject(label.state, { name: 'P' });
    let s = addIssue(project.state, {
      teamId: eng.id,
      title: 'A',
      projectId: project.project.id,
      labelIds: [label.label.id],
    }).state;
    s = deleteProject(s, project.project.id);
    s = deleteLabel(s, label.label.id);
    expect(s.issues).toHaveLength(1);
    expect(s.issues[0].projectId).toBeNull();
    expect(s.issues[0].labelIds).toEqual([]);
  });

  it('reuses an existing label with the same name', () => {
    const first = addLabel(emptyState(), { name: 'Revisão' });
    const second = addLabel(first.state, { name: 'revisao ' });
    expect(second.label.id).toBe(first.label.id);
    expect(second.state.labels).toHaveLength(1);
  });
});

describe('project progress', () => {
  it('ignores canceled issues', () => {
    const { state, eng } = twoTeams();
    const project = addProject(state, { name: 'P' });
    const base = { teamId: eng.id, projectId: project.project.id };
    let s = project.state;
    s = addIssue(s, { ...base, title: 'a', status: 'done' }).state;
    s = addIssue(s, { ...base, title: 'b', status: 'todo' }).state;
    s = addIssue(s, { ...base, title: 'c', status: 'in_progress' }).state;
    s = addIssue(s, { ...base, title: 'd', status: 'done' }).state;
    s = addIssue(s, { ...base, title: 'e', status: 'canceled' }).state;
    expect(projectProgress(s, project.project.id)).toEqual({ total: 4, done: 2, percent: 50 });
    expect(projectProgress(s, 'other')).toEqual({ total: 0, done: 0, percent: 0 });
  });
});

describe('parseState', () => {
  it('round-trips a valid state through JSON', () => {
    const { state, eng } = twoTeams();
    const s = addIssue(state, { teamId: eng.id, title: 'A' }).state;
    expect(parseState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('rejects malformed data', () => {
    expect(() => parseState(null)).toThrow();
    expect(() => parseState({ teams: [] })).toThrow();
    expect(() =>
      parseState({
        teams: [],
        projects: [],
        labels: [],
        issues: [{ id: 'x', title: 'orphan', teamId: 'missing', status: 'todo' }],
      }),
    ).toThrow();
  });
});

describe('sub-issues', () => {
  it('lists children and promotes them when the parent is deleted', () => {
    const { state, eng } = twoTeams();
    const parent = addIssue(state, { teamId: eng.id, title: 'Parent' });
    const child = addIssue(parent.state, { teamId: eng.id, title: 'Child', parentId: parent.issue.id });
    expect(subIssues(child.state, parent.issue.id).map((i) => i.title)).toEqual(['Child']);
    const after = deleteIssue(child.state, parent.issue.id);
    expect(after.issues).toHaveLength(1);
    expect(after.issues[0].parentId).toBeNull();
  });

  it('drops parent links that point to issues missing from the data', () => {
    const { state, eng } = twoTeams();
    const s = addIssue(state, { teamId: eng.id, title: 'A', parentId: 'gone' }).state;
    expect(parseState(JSON.parse(JSON.stringify(s))).issues[0].parentId).toBeNull();
  });

  it('fills defaults for files saved before comments and links existed', () => {
    const { state, eng } = twoTeams();
    const s = addIssue(state, { teamId: eng.id, title: 'A' }).state;
    const old = JSON.parse(JSON.stringify(s));
    delete old.issues[0].comments;
    delete old.issues[0].links;
    delete old.issues[0].parentId;
    const parsed = parseState(old).issues[0];
    expect(parsed.comments).toEqual([]);
    expect(parsed.links).toEqual([]);
    expect(parsed.parentId).toBeNull();
  });
});

describe('mergeState', () => {
  function workspace(teamName: string, key: string, labelName: string) {
    const team = addTeam(emptyState(), { name: teamName, key });
    const label = addLabel(team.state, { name: labelName });
    const issue = addIssue(label.state, { teamId: team.team.id, title: `${key} issue`, labelIds: [label.label.id] });
    return issue.state;
  }

  it('adds a second workspace without touching the first', () => {
    const first = workspace('Acme', 'ACM', 'Bug');
    const second = workspace('Estudos', 'EST', 'Leitura');
    const { state, summary } = mergeState(first, second);
    expect(state.teams.map((t) => t.key)).toEqual(['ACM', 'EST']);
    expect(state.issues).toHaveLength(2);
    expect(summary).toMatchObject({ added: 1, updated: 0, labels: 1 });
  });

  it('updates in place when the same file is imported again', () => {
    const first = workspace('Acme', 'ACM', 'Bug');
    const edited = JSON.parse(JSON.stringify(first));
    edited.issues[0].title = 'Renamed';
    const once = mergeState(emptyState(), first).state;
    const { state, summary } = mergeState(once, edited);
    expect(state.issues).toHaveLength(1);
    expect(state.issues[0].title).toBe('Renamed');
    expect(summary).toMatchObject({ added: 0, updated: 1 });
  });

  it('reuses an existing label with the same name and remaps the issue', () => {
    const first = workspace('Acme', 'ACM', 'Bug');
    const second = workspace('Estudos', 'EST', 'bug');
    const { state } = mergeState(first, second);
    expect(state.labels).toHaveLength(1);
    const est = state.issues.find((i) => i.title === 'EST issue')!;
    expect(est.labelIds).toEqual([state.labels[0].id]);
  });

  it('refuses a different backlog that reuses a key', () => {
    const first = workspace('Acme', 'ACM', 'Bug');
    const other = workspace('Outro', 'ACM', 'Bug');
    expect(() => mergeState(first, other)).toThrow(/ACM/);
  });

  it('keeps the team sequence ahead of imported numbers', () => {
    const first = workspace('Acme', 'ACM', 'Bug');
    const imported = JSON.parse(JSON.stringify(first));
    imported.issues[0].number = 42;
    imported.teams[0].nextNumber = 1;
    const { state } = mergeState(emptyState(), imported);
    expect(state.teams[0].nextNumber).toBe(43);
  });
});
