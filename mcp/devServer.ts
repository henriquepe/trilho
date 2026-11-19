// Local stand-in for the hosted Trilho, for e2e tests of the app's cloud mode: the same
// handler as the Lambda over node:http, with an in-memory workspace and permissive CORS.
//
//   npx vite-node mcp/devServer.ts -- [port] [token] [seed.json]
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { handleHttp } from './http';
import { memoryObject } from './memoryObject';

const [port = '8787', token = 'dev-token', seedFile] = process.argv.slice(2).filter((arg) => arg !== '--');
const object = memoryObject(seedFile ? readFileSync(seedFile, 'utf8') : null);
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, if-match, if-none-match, mcp-protocol-version, x-trilho-author',
  'access-control-expose-headers': 'etag',
};

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && body;
  const response = await handleHttp(
    new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers, body: hasBody ? body : undefined }),
    { object, tokens: async () => [token], defaultAuthor: 'Claude' },
  );
  res.writeHead(response.status, { ...Object.fromEntries(response.headers), ...cors });
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(Number(port), () => console.log(`Trilho dev server on http://localhost:${port}`));
