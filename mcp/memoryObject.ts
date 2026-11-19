import type { VersionedObject } from './remoteStore';

/** In-memory VersionedObject with real ETag checks: for tests and local runs of the HTTP server. */
export function memoryObject(initial: string | null = null): VersionedObject & { body: () => string | null } {
  let body = initial;
  let version = initial === null ? 0 : 1;
  const etag = () => `"v${version}"`;
  return {
    body: () => body,
    async get() {
      return body === null ? null : { body, etag: etag() };
    },
    async put(next, ifMatch) {
      const matches = ifMatch === null ? body === null : body !== null && ifMatch === etag();
      if (!matches) return 'conflict';
      body = next;
      version += 1;
      return { etag: etag() };
    },
  };
}
