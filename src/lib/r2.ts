import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { extensionFor } from './files';

function config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const endpoint =
    process.env.R2_ENDPOINT ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  return {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    endpoint,
  };
}

export function isR2Configured(): boolean {
  const c = config();
  return Boolean(c.accessKeyId && c.secretAccessKey && c.bucket && c.endpoint);
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (!isR2Configured()) {
    throw new Error('R2 is not configured (missing R2_* environment variables)');
  }
  if (!client) {
    const c = config();
    client = new S3Client({
      region: process.env.R2_REGION ?? 'auto',
      endpoint: c.endpoint,
      credentials: {
        accessKeyId: c.accessKeyId as string,
        secretAccessKey: c.secretAccessKey as string,
      },
    });
  }
  return client;
}

export function buildObjectKey(projectId: string, parentType: string, mimeType: string): string {
  const ext = extensionFor(mimeType);
  return `projects/${projectId}/${parentType}/${randomUUID()}.${ext}`;
}

export async function presignPutUrl(key: string, mimeType: string): Promise<string> {
  const c = config();
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: c.bucket, Key: key, ContentType: mimeType }),
    { expiresIn: 600 },
  );
}

/** Short-lived signed GET URL. Buckets are private; there is no public URL. */
export async function getReadUrl(fileKey: string): Promise<string> {
  const c = config();
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: c.bucket, Key: fileKey }), {
    expiresIn: 3600,
  });
}

/** Streams an object for app-proxied downloads (never exposes the raw object URL). */
export async function getObjectStream(
  fileKey: string,
): Promise<{ body: ReadableStream; contentLength: number | null }> {
  const c = config();
  const res = await s3().send(new GetObjectCommand({ Bucket: c.bucket, Key: fileKey }));
  const body = res.Body?.transformToWebStream() as ReadableStream | undefined;
  if (!body) throw new Error('Object body is empty');
  return { body, contentLength: typeof res.ContentLength === 'number' ? res.ContentLength : null };
}

/** Returns the stored object's size in bytes, or null if the object does not exist. */
export async function headObjectSize(fileKey: string): Promise<number | null> {
  const c = config();
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: c.bucket, Key: fileKey }));
    return typeof res.ContentLength === 'number' ? res.ContentLength : null;
  } catch {
    return null;
  }
}

export async function deleteObject(fileKey: string): Promise<void> {
  const c = config();
  await s3().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: fileKey }));
}

/** Batch-deletes up to 1000 keys. Returns which keys were deleted and which failed. */
export async function deleteObjects(keys: string[]): Promise<{ deleted: string[]; failed: string[] }> {
  if (keys.length === 0) return { deleted: [], failed: [] };
  const c = config();
  const res = await s3().send(
    new DeleteObjectsCommand({
      Bucket: c.bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: false },
    }),
  );
  const deleted = (res.Deleted ?? []).map((d) => d.Key).filter((k): k is string => Boolean(k));
  const failed = (res.Errors ?? []).map((e) => e.Key).filter((k): k is string => Boolean(k));
  return { deleted, failed };
}
