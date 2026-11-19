import { timingSafeEqual } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { parseState } from '../src/model';
import type { VersionedObject } from './remoteStore';
import { remoteStore } from './remoteStore';
import { createTrilhoServer } from './server';

// Hosted Trilho: one HTTP handler for the MCP connector and the desktop app.
//
//   GET  /health        no auth, for smoke checks
//   POST /mcp           MCP (Streamable HTTP, stateless, JSON responses)
//   GET  /workspace     the whole workspace, with its ETag (304 when If-None-Match still matches)
//   PUT  /workspace     replaces it; needs If-Match (or If-None-Match: * to create it)
//
// Every route except /health needs `Authorization: Bearer <token>`.
// Bots can sign their comments with an `X-Trilho-Author` header.

export interface HttpDeps {
  object: VersionedObject;
  /** Accepted bearer tokens. */
  tokens: () => Promise<string[]>;
  defaultAuthor: string;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function authorized(request: Request, tokens: () => Promise<string[]>) {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  const accepted = await tokens();
  return accepted.some((token) => token.length > 0 && sameSecret(match[1], token));
}

async function handleMcp(request: Request, deps: HttpDeps) {
  if (request.method !== 'POST') {
    // Stateless server: no standalone SSE stream and no sessions to delete.
    return json(405, { error: 'Use POST /mcp.' }, { allow: 'POST' });
  }
  const author = request.headers.get('x-trilho-author')?.trim().slice(0, 80) || deps.defaultAuthor;
  const server = createTrilhoServer({ store: remoteStore(deps.object), author });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

async function handleWorkspace(request: Request, deps: HttpDeps) {
  if (request.method === 'GET') {
    const current = await deps.object.get();
    if (!current) return json(404, { error: 'Workspace not uploaded yet.' });
    // The app polls with If-None-Match: an unchanged workspace costs a few bytes, not the whole file.
    if (request.headers.get('if-none-match') === current.etag) {
      return new Response(null, { status: 304, headers: { etag: current.etag, 'cache-control': 'no-store' } });
    }
    return new Response(current.body, {
      status: 200,
      headers: { 'content-type': 'application/json', etag: current.etag, 'cache-control': 'no-store' },
    });
  }

  if (request.method === 'PUT') {
    const ifMatch = request.headers.get('if-match');
    const createOnly = request.headers.get('if-none-match') === '*';
    if (!ifMatch && !createOnly) {
      return json(428, { error: 'Send If-Match with the ETag you read (or If-None-Match: * to create).' });
    }
    let state;
    try {
      state = parseState(JSON.parse(await request.text()));
    } catch {
      return json(400, { error: 'Body is not a valid Trilho workspace.' });
    }
    const written = await deps.object.put(JSON.stringify(state), createOnly ? null : ifMatch);
    if (written === 'conflict') return json(412, { error: 'Workspace changed since you read it.' });
    return json(200, { etag: written.etag }, { etag: written.etag });
  }

  return json(405, { error: 'Use GET or PUT.' }, { allow: 'GET, PUT' });
}

export async function handleHttp(request: Request, deps: HttpDeps): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

  // CORS preflight: API Gateway adds the CORS headers, but ANY /{proxy+} forwards OPTIONS here
  // and browsers need a 2xx for it. Preflights never carry the token.
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (path === '/health') return json(200, { ok: true });
  if (path !== '/mcp' && path !== '/workspace') return json(404, { error: 'Not found.' });
  if (!(await authorized(request, deps.tokens))) {
    return json(401, { error: 'Missing or invalid bearer token.' }, { 'www-authenticate': 'Bearer' });
  }

  try {
    return path === '/mcp' ? await handleMcp(request, deps) : await handleWorkspace(request, deps);
  } catch (error) {
    console.error('Request failed', error);
    return json(500, { error: 'Internal error.' });
  }
}
