#!/usr/bin/env node
// Exports a Linear workspace (read-only) to a Trilho import file.
//
//   LINEAR_API_KEY=... node scripts/linear-to-trilho.mjs imports/linear-workspace.json
//
// Teams become backlogs (same key, so MIG-12 stays MIG-12), projects stay projects,
// sub-issues keep their parent, and comments and attachments come along. Archived
// items are skipped. Import the file in Trilho with "Importar": it merges, never replaces.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const apiKey = process.env.LINEAR_API_KEY;
const output = process.argv[2];
if (!apiKey || !output) {
  console.error('Usage: LINEAR_API_KEY=... node scripts/linear-to-trilho.mjs <output.json>');
  process.exit(1);
}

async function graphql(query, variables = {}) {
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) {
    throw new Error(`Linear API error: ${JSON.stringify(body.errors ?? response.status)}`);
  }
  return body.data;
}

/** Fetches every page of a connection. Small pages keep each query under Linear's complexity limit. */
async function fetchAll(query, field, pageSize) {
  const nodes = [];
  let after = null;
  for (;;) {
    const data = await graphql(query, { first: pageSize, after });
    nodes.push(...data[field].nodes);
    if (!data[field].pageInfo.hasNextPage) return nodes;
    after = data[field].pageInfo.endCursor;
  }
}

const page = 'pageInfo { hasNextPage endCursor }';

const { organization } = await graphql('{ organization { name urlKey } }');
const teams = await fetchAll(
  `query($first: Int, $after: String) { teams(first: $first, after: $after) { ${page} nodes { id key name color createdAt } } }`,
  'teams',
  50,
);
const projects = await fetchAll(
  `query($first: Int, $after: String) { projects(first: $first, after: $after) { ${page}
    nodes { id name description state color targetDate createdAt } } }`,
  'projects',
  50,
);
const labels = await fetchAll(
  `query($first: Int, $after: String) { issueLabels(first: $first, after: $after) { ${page}
    nodes { id name color isGroup parent { name } } } }`,
  'issueLabels',
  100,
);
const issues = await fetchAll(
  `query($first: Int, $after: String) { issues(first: $first, after: $after) { ${page}
    nodes {
      id number title description priority estimate dueDate createdAt updatedAt
      state { name type }
      team { id }
      project { id }
      parent { id }
      labels(first: 20) { nodes { id } }
      comments(first: 100) { nodes { id body createdAt user { name } botActor { name } } }
      attachments(first: 50) { nodes { title url } }
    } } }`,
  'issues',
  25,
);

/** Linear workflow state -> Trilho status. "Review"-named started states map to "Em revisão". */
function mapStatus(state) {
  switch (state.type) {
    case 'unstarted':
      return 'todo';
    case 'started':
      return /review|revis/i.test(state.name) ? 'in_review' : 'in_progress';
    case 'completed':
      return 'done';
    case 'canceled':
    case 'duplicate':
      return 'canceled';
    default: // triage, backlog
      return 'backlog';
  }
}

const PROJECT_STATUS = {
  backlog: 'planned',
  planned: 'planned',
  started: 'active',
  paused: 'paused',
  completed: 'completed',
  canceled: 'canceled',
};

const maxNumber = new Map();
for (const issue of issues) {
  maxNumber.set(issue.team.id, Math.max(maxNumber.get(issue.team.id) ?? 0, issue.number));
}

const state = {
  version: 1,
  teams: teams.map((team) => ({
    id: team.id,
    name: team.name,
    key: team.key,
    color: team.color ?? '#9aa0a6',
    nextNumber: (maxNumber.get(team.id) ?? 0) + 1,
    createdAt: team.createdAt,
  })),
  projects: projects.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    status: PROJECT_STATUS[project.state] ?? 'planned',
    color: project.color ?? '#6f8bea',
    targetDate: project.targetDate ?? null,
    createdAt: project.createdAt,
  })),
  labels: labels
    .filter((label) => !label.isGroup)
    .map((label) => ({
      id: label.id,
      name: label.parent ? `${label.parent.name}/${label.name}` : label.name,
      color: label.color ?? '#9aa0a6',
    })),
  issues: issues.map((issue) => ({
    id: issue.id,
    teamId: issue.team.id,
    number: issue.number,
    title: issue.title,
    description: issue.description ?? '',
    status: mapStatus(issue.state),
    priority: issue.priority ?? 0,
    projectId: issue.project?.id ?? null,
    labelIds: issue.labels.nodes.map((label) => label.id),
    estimate: issue.estimate ?? null,
    dueDate: issue.dueDate ?? null,
    parentId: issue.parent?.id ?? null,
    comments: issue.comments.nodes
      .map((comment) => ({
        id: comment.id,
        author: comment.user?.name ?? comment.botActor?.name ?? 'Linear',
        body: comment.body,
        createdAt: comment.createdAt,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    links: issue.attachments.nodes.map((attachment) => ({
      title: attachment.title ?? '',
      url: attachment.url,
    })),
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  })),
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(state, null, 2));

const counts = (list) => list.length;
console.log(
  `${organization.name}: ${counts(state.teams)} backlogs, ${counts(state.projects)} projetos, ` +
    `${counts(state.labels)} etiquetas, ${counts(state.issues)} issues ` +
    `(${state.issues.filter((i) => i.parentId).length} sub-issues, ` +
    `${state.issues.reduce((n, i) => n + i.comments.length, 0)} comentários, ` +
    `${state.issues.reduce((n, i) => n + i.links.length, 0)} links) -> ${output}`,
);
