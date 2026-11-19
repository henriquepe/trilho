import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { parseState } from '../src/model';
import type { WorkspaceChange, WorkspaceStore } from './storage';

/** One object with a version tag (ETag): the hosted workspace. */
export interface VersionedObject {
  /** Body and ETag, or null when the object does not exist yet. */
  get(): Promise<{ body: string; etag: string } | null>;
  /**
   * Writes only if the object is still at `ifMatch` (null: only if it does not exist).
   * Returns the new ETag, or 'conflict' when someone else wrote first.
   */
  put(body: string, ifMatch: string | null): Promise<{ etag: string } | 'conflict'>;
}

export const MISSING_WORKSPACE =
  'O workspace hospedado ainda não existe. Envie o trilho.json atual (PUT /workspace) antes de usar o conector.';

function isStatus(error: unknown, ...codes: number[]) {
  return error instanceof S3ServiceException && codes.includes(error.$metadata.httpStatusCode ?? 0);
}

/** S3 object with conditional writes (If-Match / If-None-Match). */
export function s3Object(client: S3Client, bucket: string, key: string): VersionedObject {
  return {
    async get() {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return { body: await object.Body!.transformToString(), etag: object.ETag! };
      } catch (error) {
        if (error instanceof NoSuchKey || isStatus(error, 404)) return null;
        throw error;
      }
    },
    async put(body, ifMatch) {
      try {
        const written = await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: 'application/json',
            ...(ifMatch === null ? { IfNoneMatch: '*' } : { IfMatch: ifMatch }),
          }),
        );
        return { etag: written.ETag! };
      } catch (error) {
        // 412: precondition failed. 409: a concurrent conditional write to the same key won.
        if (isStatus(error, 409, 412)) return 'conflict';
        throw error;
      }
    },
  };
}

/** Workspace kept in a versioned object. Changes are retried on top of the latest copy when they collide. */
export function remoteStore(object: VersionedObject, maxAttempts = 5): WorkspaceStore {
  async function load() {
    const current = await object.get();
    if (!current) throw new Error(MISSING_WORKSPACE);
    return { state: parseState(JSON.parse(current.body)), etag: current.etag };
  }

  return {
    read: async () => (await load()).state,
    async update<T>(change: WorkspaceChange<T>) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { state, etag } = await load();
        const { state: next, result } = change(state);
        if ((await object.put(JSON.stringify(next), etag)) !== 'conflict') return result;
      }
      throw new Error('O workspace mudou várias vezes seguidas durante a gravação. Tente de novo.');
    },
  };
}
