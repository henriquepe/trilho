export type StatusId = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';

/** 0 = none, 1 = urgent, 2 = high, 3 = medium, 4 = low */
export type Priority = 0 | 1 | 2 | 3 | 4;

export type ProjectStatus = 'planned' | 'active' | 'paused' | 'completed' | 'canceled';

/** A team owns one backlog. Issue keys are `${team.key}-${issue.number}`. */
export interface Team {
  id: string;
  name: string;
  key: string;
  color: string;
  nextNumber: number;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  color: string;
  targetDate: string | null;
  createdAt: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

/** Comment on an issue: imported (e.g. from Linear) or added through the MCP connector. */
export interface IssueComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface IssueLink {
  title: string;
  url: string;
}

export interface Issue {
  id: string;
  teamId: string;
  number: number;
  title: string;
  description: string;
  status: StatusId;
  priority: Priority;
  projectId: string | null;
  labelIds: string[];
  estimate: number | null;
  dueDate: string | null;
  /** Parent issue in the same workspace; sub-issues are listed on the parent's page. */
  parentId: string | null;
  comments: IssueComment[];
  links: IssueLink[];
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  version: 1;
  teams: Team[];
  projects: Project[];
  labels: Label[];
  issues: Issue[];
}
