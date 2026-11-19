import { parseState } from '../model';
import type { AppState } from '../types';

/** Hosted Trilho (see infra/ and mcp/http.ts): base URL and bearer token. */
export interface CloudConfig {
  url: string;
  token: string;
}

const CONFIG_KEY = 'trilho.cloud';

export function loadCloudConfig(): CloudConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const config = JSON.parse(raw) as CloudConfig;
    return config.url && config.token ? config : null;
  } catch {
    return null;
  }
}

export function saveCloudConfig(config: CloudConfig | null) {
  try {
    if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(CONFIG_KEY);
  } catch (error) {
    console.error('Could not store the cloud settings', error);
  }
}

export const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '').replace(/\/(mcp|workspace)$/, '');

export type Fetched = { status: 'unchanged' } | { status: 'missing' } | { status: 'ok'; state: AppState; etag: string };
export type Written = { status: 'ok'; etag: string } | { status: 'conflict' };

export interface CloudClient {
  get(etag?: string | null): Promise<Fetched>;
  put(state: AppState, etag: string | null): Promise<Written>;
}

export class CloudError extends Error {}

export function cloudClient(config: CloudConfig, fetchImpl: typeof fetch = (...args) => fetch(...args)): CloudClient {
  const base = normalizeUrl(config.url);

  async function call(init: RequestInit & { headers: Record<string, string> }) {
    let response: Response;
    try {
      response = await fetchImpl(`${base}/workspace`, {
        ...init,
        cache: 'no-store',
        headers: { authorization: `Bearer ${config.token}`, ...init.headers },
      });
    } catch {
      throw new CloudError('Sem conexão com a nuvem.');
    }
    if (response.status === 401) throw new CloudError('Token recusado pela nuvem.');
    if (response.status >= 500) throw new CloudError(`A nuvem respondeu com erro (${response.status}).`);
    return response;
  }

  return {
    async get(etag) {
      const response = await call({ method: 'GET', headers: etag ? { 'if-none-match': etag } : {} });
      if (response.status === 304) return { status: 'unchanged' };
      if (response.status === 404) return { status: 'missing' };
      if (!response.ok) throw new CloudError(`A nuvem respondeu com erro (${response.status}).`);
      const newEtag = response.headers.get('etag');
      if (!newEtag) throw new CloudError('A nuvem não informou a versão (ETag). Confira o CORS do deploy.');
      return { status: 'ok', state: parseState(await response.json()), etag: newEtag };
    },
    async put(state, etag) {
      const response = await call({
        method: 'PUT',
        body: JSON.stringify(state),
        headers: { 'content-type': 'application/json', ...(etag ? { 'if-match': etag } : { 'if-none-match': '*' }) },
      });
      if (response.status === 412) return { status: 'conflict' };
      if (!response.ok) throw new CloudError(`A nuvem recusou a gravação (${response.status}).`);
      const { etag: written } = (await response.json()) as { etag: string };
      return { status: 'ok', etag: written };
    },
  };
}
