// AWS Lambda entry for the hosted Trilho (HTTP API, payload format 2.0). See http.ts for the routes.
//
//   TRILHO_BUCKET            S3 bucket holding the workspace
//   TRILHO_OBJECT_KEY        object key (default: workspace.json)
//   TRILHO_TOKEN_PARAMETER   SSM SecureString with the accepted bearer tokens (comma-separated)
//   TRILHO_AUTHOR            default comment author (default: Claude)

import { S3Client } from '@aws-sdk/client-s3';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { handleHttp } from './http';
import { s3Object } from './remoteStore';

interface HttpApiEvent {
  rawPath: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string }; domainName: string };
}

interface HttpApiResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const object = s3Object(new S3Client({}), process.env.TRILHO_BUCKET!, process.env.TRILHO_OBJECT_KEY || 'workspace.json');
const ssm = new SSMClient({});

// Cached per container for 5 minutes, so a rotated token takes effect without a deploy.
let cachedTokens: { values: string[]; at: number } | null = null;
async function tokens() {
  if (cachedTokens && Date.now() - cachedTokens.at < 5 * 60_000) return cachedTokens.values;
  const parameter = await ssm.send(
    new GetParameterCommand({ Name: process.env.TRILHO_TOKEN_PARAMETER!, WithDecryption: true }),
  );
  const values = (parameter.Parameter?.Value ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  cachedTokens = { values, at: Date.now() };
  return values;
}

export function toRequest(event: HttpApiEvent): Request {
  const { method } = event.requestContext.http;
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const headers = new Headers();
  for (const [name, value] of Object.entries(event.headers ?? {})) if (value !== undefined) headers.set(name, value);
  const hasBody = method !== 'GET' && method !== 'HEAD' && event.body !== undefined;
  const body = hasBody ? (event.isBase64Encoded ? Buffer.from(event.body!, 'base64') : event.body) : undefined;
  return new Request(`https://${event.requestContext.domainName}${event.rawPath}${query}`, { method, headers, body });
}

export async function toResult(response: Response): Promise<HttpApiResult> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  return { statusCode: response.status, headers, body: await response.text() };
}

export async function handler(event: HttpApiEvent): Promise<HttpApiResult> {
  const response = await handleHttp(toRequest(event), {
    object,
    tokens,
    defaultAuthor: process.env.TRILHO_AUTHOR?.trim() || 'Claude',
  });
  return toResult(response);
}
