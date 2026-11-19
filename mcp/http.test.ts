import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addTeam, emptyState } from '../src/model';
import { handleHttp, type HttpDeps } from './http';
import { toRequest, toResult } from './lambda';
import { memoryObject } from './memoryObject';
import { remoteStore, type VersionedObject } from './remoteStore';

const TOKEN = 'test-token-123';
const BASE = 'https://trilho.test';
const seed = () => JSON.stringify(addTeam(emptyState(), { name: 'Aplicativo', key: 'APP' }).state);

let object: ReturnType<typeof memoryObject>;
let deps: HttpDeps;
let client: Client | null = null;

const send = (path: string, init: RequestInit = {}, token: string | null = TOKEN) =>
  handleHttp(
    new Request(`${BASE}${path}`, {
      ...init,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers as object) },
    }),
    deps,
  );

async function connect(author?: string) {
  client = new Client({ name: 'test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${TOKEN}`, ...(author ? { 'x-trilho-author': author } : {}) } },
    fetch: (url, init) => handleHttp(new Request(url, init), deps),
  });
  await client.connect(transport);
  return client;
}

async function call(c: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await c.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: { text: string }[];
  };
  return { isError: result.isError ?? false, text: result.content[0].text };
}

beforeEach(() => {
  object = memoryObject(seed());
  deps = { object, tokens: async () => [TOKEN, 'second-token'], defaultAuthor: 'Claude' };
});

afterEach(async () => {
  await client?.close();
  client = null;
});

describe('auth', () => {
  it('leaves /health open and closes everything else', async () => {
    expect((await send('/health', {}, null)).status).toBe(200);
    expect((await send('/workspace', {}, null)).status).toBe(401);
    expect((await send('/workspace', {}, 'wrong')).status).toBe(401);
    expect((await send('/mcp', { method: 'POST' }, null)).status).toBe(401);
    expect((await send('/workspace', {}, 'second-token')).status).toBe(200);
  });

  it('answers 404 for unknown paths', async () => {
    expect((await send('/nope')).status).toBe(404);
  });
});

describe('MCP over HTTP', () => {
  it('runs the same tools against the hosted workspace', async () => {
    const c = await connect('Forgex QA');
    const { tools } = await c.listTools();
    expect(tools).toHaveLength(11);

    const created = await call(c, 'create_issue', { backlog: 'APP', title: 'Bug no login', priority: 'urgent' });
    expect(JSON.parse(created.text)).toMatchObject({ key: 'APP-1' });
    await call(c, 'add_comment', { key: 'APP-1', body: 'Reproduzido no emulador' });

    const saved = JSON.parse(object.body()!);
    expect(saved.issues[0]).toMatchObject({ title: 'Bug no login', priority: 1 });
    expect(saved.issues[0].comments[0]).toMatchObject({ author: 'Forgex QA', body: 'Reproduzido no emulador' });
  });

  it('uses the default author without the header', async () => {
    const c = await connect();
    await call(c, 'create_issue', { backlog: 'APP', title: 'x' });
    await call(c, 'add_comment', { key: 'APP-1', body: 'oi' });
    expect(JSON.parse(object.body()!).issues[0].comments[0].author).toBe('Claude');
  });

  it('explains when the workspace was never uploaded', async () => {
    object = memoryObject(null);
    deps = { ...deps, object };
    const c = await connect();
    const result = await call(c, 'list_backlogs');
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/ainda não existe/);
  });

  it('rejects GET /mcp (stateless, no SSE stream)', async () => {
    expect((await send('/mcp')).status).toBe(405);
  });
});

describe('/workspace', () => {
  it('reads with an ETag and writes only on a matching one', async () => {
    const read = await send('/workspace');
    const etag = read.headers.get('etag')!;
    const state = await read.json();
    state.teams[0].name = 'App';

    const stale = await send('/workspace', { method: 'PUT', body: JSON.stringify(state), headers: { 'if-match': '"v0"' } });
    expect(stale.status).toBe(412);

    const ok = await send('/workspace', { method: 'PUT', body: JSON.stringify(state), headers: { 'if-match': etag } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('etag')).not.toBe(etag);
    expect(JSON.parse(object.body()!).teams[0].name).toBe('App');
  });

  it('requires a precondition and a valid workspace', async () => {
    expect((await send('/workspace', { method: 'PUT', body: seed() })).status).toBe(428);
    expect((await send('/workspace', { method: 'PUT', body: '{"x":', headers: { 'if-match': '"v1"' } })).status).toBe(400);
  });

  it('creates the first copy with If-None-Match: *', async () => {
    object = memoryObject(null);
    deps = { ...deps, object };
    expect((await send('/workspace')).status).toBe(404);
    const created = await send('/workspace', { method: 'PUT', body: seed(), headers: { 'if-none-match': '*' } });
    expect(created.status).toBe(200);
    const again = await send('/workspace', { method: 'PUT', body: seed(), headers: { 'if-none-match': '*' } });
    expect(again.status).toBe(412);
  });
});

describe('remoteStore', () => {
  it('reapplies the change on top of a concurrent write', async () => {
    const shared = memoryObject(seed());
    let raced = false;
    // The first write loses to another client that renamed the backlog in between.
    const racing: VersionedObject = {
      get: shared.get,
      async put(body, ifMatch) {
        if (!raced) {
          raced = true;
          const other = JSON.parse(shared.body()!);
          other.teams[0].name = 'Renomeado';
          await shared.put(JSON.stringify(other), (await shared.get())!.etag);
        }
        return shared.put(body, ifMatch);
      },
    };
    const store = remoteStore(racing);
    const key = await store.update((state) => ({ state: { ...state, labels: [] }, result: 'done' }));
    expect(key).toBe('done');
    expect(JSON.parse(shared.body()!).teams[0].name).toBe('Renomeado');
  });

  it('gives up after repeated conflicts', async () => {
    const always: VersionedObject = { get: async () => ({ body: seed(), etag: '"x"' }), put: async () => 'conflict' };
    await expect(remoteStore(always, 3).update((s) => ({ state: s, result: 1 }))).rejects.toThrow(/várias vezes/);
  });
});

describe('Lambda adapter', () => {
  it('turns an HTTP API event into a Request and back', async () => {
    const request = toRequest({
      rawPath: '/workspace',
      rawQueryString: 'a=1',
      headers: { 'if-match': '"v1"', authorization: 'Bearer t' },
      body: Buffer.from('{"ok":true}').toString('base64'),
      isBase64Encoded: true,
      requestContext: { http: { method: 'PUT' }, domainName: 'trilho.example.com' },
    });
    expect(request.url).toBe('https://trilho.example.com/workspace?a=1');
    expect(request.headers.get('if-match')).toBe('"v1"');
    expect(await request.text()).toBe('{"ok":true}');

    const result = await toResult(new Response('{"x":1}', { status: 201, headers: { etag: '"e"' } }));
    expect(result).toMatchObject({ statusCode: 201, body: '{"x":1}' });
    expect(result.headers.etag).toBe('"e"');
  });
});
