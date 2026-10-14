#!/usr/bin/env node
/**
 * Encrypted Neon Postgres backup.
 *
 *   node scripts/db-backup.mjs
 *
 * - Dumps only the `public` schema (never the provider-managed `neon_auth` schema).
 * - Uses a pg_dump matching the server major version (falls back to Docker `postgres:<major>`
 *   when the local client is older, e.g. local 16 vs server 18).
 * - Encrypts with AES-256-CBC (openssl, pbkdf2) using BACKUP_PASSPHRASE.
 * - Uploads to R2 (BACKUP_BUCKET or R2_BUCKET) under backups/.
 * - Prunes backups older than BACKUP_RETENTION_DAYS (default 30).
 *
 * Operator tool — runs on a machine with network access, NOT inside Vercel.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

// ---- env -------------------------------------------------------------------
function loadEnv() {
  const file = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
const PASSPHRASE = process.env.BACKUP_PASSPHRASE;
const ACCOUNT = process.env.R2_ACCOUNT_ID;
const ENDPOINT = process.env.R2_ENDPOINT;
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.BACKUP_BUCKET || process.env.R2_BUCKET;
const REGION = process.env.R2_REGION || 'auto';
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || '30');

for (const [k, v] of Object.entries({ URL, PASSPHRASE, ENDPOINT, ACCESS_KEY, SECRET, BUCKET })) {
  if (!v) {
    console.error(`Missing required env: ${k}. See .env.example.`);
    process.exit(1);
  }
}

const MAXBUF = 1024 * 1024 * 1024;

function has(cmd) {
  try {
    execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
function major(versionText) {
  const m = versionText.match(/(\d+)\./);
  return m ? Number(m[1]) : NaN;
}
function out(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

function serverMajor() {
  try {
    return Number(out('psql', [URL, '-tAc', "select current_setting('server_version_num')"]).trim()) / 10000 | 0;
  } catch {
    return NaN;
  }
}

function buildDumpCommand(sMajor) {
  const localOk = has('pg_dump');
  const localMajor = localOk ? major(out('pg_dump', ['--version'])) : NaN;
  const args = ['-Fc', '--no-owner', '--no-privileges', '--schema=public', URL];
  if (localOk && (!sMajor || localMajor >= sMajor)) {
    return { cmd: 'pg_dump', args };
  }
  if (has('docker') && sMajor) {
    console.error(`Local pg_dump is older than server PG${sMajor}; using docker postgres:${sMajor}`);
    return { cmd: 'docker', args: ['run', '--rm', '-i', `postgres:${sMajor}`, 'pg_dump', ...args] };
  }
  throw new Error('No suitable pg_dump available. Install postgresql-client matching the server, or Docker.');
}

async function main() {
  const sMajor = serverMajor();
  const { cmd, args } = buildDumpCommand(sMajor);
  console.error(`Dumping (public schema) via ${cmd} …`);
  // Capture raw bytes — the custom-format archive is binary.
  const dump = execFileSync(cmd, args, { maxBuffer: MAXBUF });

  const sha = crypto.createHash('sha256').update(dump).digest('hex');
  const enc = execFileSync(
    'openssl',
    ['enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-pass', 'env:BACKUP_PASSPHRASE'],
    { input: dump, maxBuffer: MAXBUF, env: process.env },
  );

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `backups/${stamp}.dump.enc`;

  const s3 = new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET },
  });
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: enc,
      ContentType: 'application/octet-stream',
      Metadata: { sha256: sha, schema: 'public' },
    }),
  );
  console.error(`Uploaded s3://${BUCKET}/${key} (${(enc.length / 1024 / 1024).toFixed(2)} MB) sha256=${sha}`);

  // Prune old backups (paginated; DeleteObjects in batches).
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  let token;
  let pruned = 0;
  do {
    const listed = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'backups/', ContinuationToken: token }),
    );
    const old = (listed.Contents ?? []).filter((o) => o.LastModified && o.LastModified.getTime() < cutoff);
    if (old.length) {
      await s3.send(
        new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: old.map((o) => ({ Key: o.Key })) } }),
      );
      pruned += old.length;
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  if (pruned) console.error(`Pruned ${pruned} backup(s) older than ${RETENTION_DAYS} days.`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
