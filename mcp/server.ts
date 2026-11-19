import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WorkspaceStore } from './storage';
import {
  commentOnIssue,
  createBacklog,
  createIssue,
  createProject,
  editIssue,
  editProject,
  findIssue,
  issueDetails,
  listBacklogs,
  listLabels,
  listProjects,
  PRIORITY_NAMES,
  PROJECT_STATUS_IDS,
  searchIssues,
  STATUS_IDS,
} from './tools';

export const SERVER_VERSION = '0.3.0';

const status = z
  .enum(STATUS_IDS)
  .describe('backlog, todo (a fazer), in_progress, in_review, done (concluída) or canceled');
const priority = z.enum(PRIORITY_NAMES).describe('none, urgent, high, medium or low');
const projectStatus = z.enum(PROJECT_STATUS_IDS);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const issueFields = {
  description: z.string().optional().describe('Markdown body'),
  status: status.optional(),
  priority: priority.optional(),
  project: z.string().nullable().optional().describe('Project name or id; null removes it'),
  labels: z.array(z.string()).optional().describe('Label names (created when missing); replaces current labels'),
  parent: z.string().nullable().optional().describe('Parent issue key, e.g. APP-12; null removes it'),
  dueDate: date.nullable().optional(),
  estimate: z.number().min(0).nullable().optional().describe('Points'),
};

function reply(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

/** Errors become tool results the model can read and recover from, not protocol failures. */
function guarded<A>(handler: (args: A) => unknown) {
  return async (args: A) => {
    try {
      return reply(await handler(args));
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
      };
    }
  };
}

export function createTrilhoServer(options: { store: WorkspaceStore; author: string }): McpServer {
  const { store, author } = options;
  const read = () => store.read();
  const server = new McpServer(
    { name: 'trilho', version: SERVER_VERSION },
    {
      instructions:
        'Trilho is an issue tracker. Backlogs have short keys (e.g. APP) and issues are ' +
        'addressed as KEY-NUMBER (APP-12). Use search_issues to find work, get_issue for details. ' +
        'Changes are saved to the workspace immediately and appear in the open app.',
    },
  );

  const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

  server.registerTool(
    'list_backlogs',
    {
      title: 'Listar backlogs',
      description: 'Lists every backlog with its key and open/total issue counts.',
      annotations: readOnly,
    },
    guarded(async () => listBacklogs(await read())),
  );

  server.registerTool(
    'list_projects',
    {
      title: 'Listar projetos',
      description: 'Lists projects with status, target date and progress (done/total issues).',
      inputSchema: { status: z.array(projectStatus).optional().describe('Only these statuses') },
      annotations: readOnly,
    },
    guarded(async (args: { status?: (typeof PROJECT_STATUS_IDS)[number][] }) => listProjects(await read(), args)),
  );

  server.registerTool(
    'list_labels',
    {
      title: 'Listar etiquetas',
      description: 'Lists labels and how many issues use each one.',
      annotations: readOnly,
    },
    guarded(async () => listLabels(await read())),
  );

  server.registerTool(
    'search_issues',
    {
      title: 'Buscar issues',
      description:
        'Finds issues, most urgent first. Without `status`, closed issues (done, canceled) are ' +
        'left out unless includeClosed is true. Text matches key, title and description, ignoring accents.',
      inputSchema: {
        text: z.string().optional(),
        backlog: z.string().optional().describe('Backlog key or name'),
        project: z.string().optional().describe('Project name or id'),
        status: z.array(status).optional(),
        priority: z.array(priority).optional(),
        label: z.string().optional().describe('Label name'),
        includeClosed: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).optional().describe('Default 50'),
      },
      annotations: readOnly,
    },
    guarded(async (args: Parameters<typeof searchIssues>[1]) => searchIssues(await read(), args)),
  );

  server.registerTool(
    'get_issue',
    {
      title: 'Ver issue',
      description: 'Full issue: description, sub-issues, links and comments.',
      inputSchema: { key: z.string().describe('Issue key, e.g. APP-12') },
      annotations: readOnly,
    },
    guarded(async ({ key }: { key: string }) => {
      const state = await read();
      return issueDetails(state, findIssue(state, key));
    }),
  );

  server.registerTool(
    'create_issue',
    {
      title: 'Criar issue',
      description: 'Creates an issue in a backlog. Defaults: status backlog, priority none.',
      inputSchema: {
        backlog: z.string().describe('Backlog key or name'),
        title: z.string().min(1),
        ...issueFields,
      },
      annotations: write,
    },
    guarded((args: Parameters<typeof createIssue>[1]) => store.update((s) => createIssue(s, args))),
  );

  server.registerTool(
    'update_issue',
    {
      title: 'Atualizar issue',
      description:
        'Changes only the fields given. Moving to another backlog gives the issue a new key. ' +
        'To close an issue, set status to done or canceled.',
      inputSchema: {
        key: z.string().describe('Issue key, e.g. APP-12'),
        title: z.string().min(1).optional(),
        backlog: z.string().optional().describe('Move to this backlog (key or name)'),
        ...issueFields,
      },
      annotations: { ...write, idempotentHint: true },
    },
    guarded((args: Parameters<typeof editIssue>[1]) => store.update((s) => editIssue(s, args))),
  );

  server.registerTool(
    'add_comment',
    {
      title: 'Comentar issue',
      description: 'Adds a comment (Markdown) to an issue.',
      inputSchema: { key: z.string(), body: z.string().min(1) },
      annotations: write,
    },
    guarded((args: { key: string; body: string }) =>
      store.update((s) => commentOnIssue(s, { ...args, author })),
    ),
  );

  server.registerTool(
    'create_backlog',
    {
      title: 'Criar backlog',
      description: 'Creates a backlog. The key (up to 6 letters/digits) is derived from the name when omitted.',
      inputSchema: { name: z.string().min(1), key: z.string().optional() },
      annotations: write,
    },
    guarded((args: { name: string; key?: string }) => store.update((s) => createBacklog(s, args))),
  );

  server.registerTool(
    'create_project',
    {
      title: 'Criar projeto',
      description: 'Creates a project. Default status: planned.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        status: projectStatus.optional(),
        targetDate: date.nullable().optional(),
      },
      annotations: write,
    },
    guarded((args: Parameters<typeof createProject>[1]) => store.update((s) => createProject(s, args))),
  );

  server.registerTool(
    'update_project',
    {
      title: 'Atualizar projeto',
      description: 'Changes only the fields given.',
      inputSchema: {
        project: z.string().describe('Project name or id'),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        status: projectStatus.optional(),
        targetDate: date.nullable().optional(),
      },
      annotations: { ...write, idempotentHint: true },
    },
    guarded((args: Parameters<typeof editProject>[1]) => store.update((s) => editProject(s, args))),
  );

  return server;
}
