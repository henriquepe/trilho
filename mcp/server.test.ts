import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addTeam, emptyState } from '../src/model';
import { createTrilhoServer } from './server';
import { dataFilePath } from './storage';

let folder: string;
let dataFile: string;
let client: Client;

async function connect(file: string) {
  const server = createTrilhoServer({ dataFile: file, author: 'Henrique' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: { type: string; text: string }[];
  };
  const text = result.content[0].text;
  return { isError: result.isError ?? false, text, json: () => JSON.parse(text) };
}

beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'trilho-mcp-'));
  dataFile = join(folder, 'trilho.json');
  writeFileSync(dataFile, JSON.stringify(addTeam(emptyState(), { name: 'Aplicativo', key: 'APP' }).state));
  await connect(dataFile);
});

afterEach(async () => {
  await client.close();
  rmSync(folder, { recursive: true, force: true });
});

describe('Trilho MCP server', () => {
  it('exposes the tools with read-only hints', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_comment',
      'create_backlog',
      'create_issue',
      'create_project',
      'get_issue',
      'list_backlogs',
      'list_labels',
      'list_projects',
      'search_issues',
      'update_issue',
      'update_project',
    ]);
    expect(tools.find((t) => t.name === 'search_issues')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'create_issue')?.annotations?.readOnlyHint).toBe(false);
  });

  it('writes changes to the data file the app reads', async () => {
    const created = await call('create_issue', { backlog: 'APP', title: 'Revisar onboarding', priority: 'high' });
    expect(created.json()).toMatchObject({ key: 'APP-1', priority: 'high' });
    await call('add_comment', { key: 'APP-1', body: 'Começando hoje' });
    await call('update_issue', { key: 'APP-1', status: 'in_progress' });

    const saved = JSON.parse(readFileSync(dataFile, 'utf8'));
    expect(saved.issues[0]).toMatchObject({ title: 'Revisar onboarding', status: 'in_progress', priority: 2 });
    expect(saved.issues[0].comments[0]).toMatchObject({ author: 'Henrique', body: 'Começando hoje' });

    const found = await call('search_issues', { text: 'onboarding' });
    expect(found.json().issues[0].key).toBe('APP-1');
    const issue = await call('get_issue', { key: 'app-1' });
    expect(issue.json().comments).toHaveLength(1);
  });

  it('returns readable errors instead of failing the call', async () => {
    const missing = await call('get_issue', { key: 'APP-9' });
    expect(missing).toMatchObject({ isError: true, text: 'Issue APP-9 não encontrada.' });
    const invalid = await call('create_issue', { backlog: 'APP', title: 'x', priority: 'urgentíssima' });
    expect(invalid.isError).toBe(true);
  });

  it('asks to open the app when there is no data file yet', async () => {
    await client.close();
    await connect(join(folder, 'missing.json'));
    const result = await call('list_backlogs');
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Abra o app Trilho/);
  });
});

describe('dataFilePath', () => {
  it('matches the desktop app data folder', () => {
    expect(dataFilePath({}, 'darwin')).toMatch(/Library\/Application Support\/com\.henriquepires\.trilho\/trilho\.json$/);
    expect(dataFilePath({ XDG_DATA_HOME: '/x' }, 'linux')).toBe('/x/com.henriquepires.trilho/trilho.json');
    expect(dataFilePath({ TRILHO_DATA_FILE: '/tmp/t.json' }, 'darwin')).toBe('/tmp/t.json');
  });
});
