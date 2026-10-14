import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

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
    publicUrl: process.env.R2_PUBLIC_URL?.replace(/\/$/, ''),
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
      region: 'auto',
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
  const ext = EXT_BY_MIME[mimeType] ?? 'bin';
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

/** Returns a durable public URL if configured, otherwise a short-lived signed GET URL. */
export async function getReadUrl(fileKey: string): Promise<string> {
  const c = config();
  if (c.publicUrl) return `${c.publicUrl}/${fileKey}`;
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: c.bucket, Key: fileKey }), {
    expiresIn: 3600,
  });
}

/** Durable public URL for a key when a public bucket is configured, else ''. */
export function publicUrlForKey(fileKey: string): string {
  const c = config();
  return c.publicUrl ? `${c.publicUrl}/${fileKey}` : '';
}

export async function deleteObject(fileKey: string): Promise<void> {
  const c = config();
  await s3().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: fileKey }));
}
