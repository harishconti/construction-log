#!/usr/bin/env node
/**
 * Restore an encrypted Neon Postgres backup.
 *
 *   node scripts/db-restore.mjs --key backups/<file>.dump.enc --target "$DIRECT_URL" --yes
 *   node scripts/db-restore.mjs --file ./backup.dump.enc --target "$DIRECT_URL" --yes
 *
 * Decrypts with BACKUP_PASSPHRASE and runs pg_restore --clean --if-exists over the target database.
 * Destructive: pass --yes to confirm. Operator tool — not for Vercel.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const KEY = arg('--key');
const FILE = arg('--file');
const TARGET = arg('--target') || process.env.DIRECT_URL || process.env.DATABASE_URL;
const PASSPHRASE = process.env.BACKUP_PASSPHRASE;
const CONFIRM = process.argv.includes('--yes');
const MAXBUF = 1024 * 1024 * 1024;

if (!KEY && !FILE) throw new Error('Provide --key <s3key> or --file <path>');
if (!TARGET) throw new Error('Provide --target <url> (or set DIRECT_URL)');
if (!PASSPHRASE) throw new Error('Missing BACKUP_PASSPHRASE');
if (!CONFIRM) throw new Error('Refusing to restore without --yes (this overwrites the target database).');

function has(cmd) {
  try {
    execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
function major(text) {
  const m = text.match(/(\d+)\./);
  return m ? Number(m[1]) : NaN;
}
function serverMajor() {
  try {
    return (
      Number(execFileSync('psql', [TARGET, '-tAc', "select current_setting('server_version_num')"], { encoding: 'utf8' }).trim()) /
        10000 |
      0
    );
  } catch {
    return NaN;
  }
}

function restoreCommand() {
  const sMajor = serverMajor();
  const localOk = has('pg_restore');
  const localMajor = localOk
    ? major(execFileSync('pg_restore', ['--version'], { encoding: 'utf8' }))
    : NaN;
  if (localOk && (!sMajor || localMajor >= sMajor)) {
    return { kind: 'local' };
  }
  if (has('docker') && sMajor) {
    console.error(`Local pg_restore is older than server PG${sMajor}; using docker postgres:${sMajor}`);
    return { kind: 'docker', image: `postgres:${sMajor}` };
  }
  throw new Error('No suitable pg_restore available. Install a matching postgresql-client, or Docker.');
}

async function main() {
  let enc;
  if (FILE) {
    enc = fs.readFileSync(FILE);
  } else {
    const s3 = new S3Client({
      region: process.env.R2_REGION || 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    });
    const res = await s3.send(
      new GetObjectCommand({ Bucket: process.env.BACKUP_BUCKET || process.env.R2_BUCKET, Key: KEY }),
    );
    enc = Buffer.from(await res.Body.transformToByteArray());
  }

  const dump = execFileSync(
    'openssl',
    ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-pass', 'env:BACKUP_PASSPHRASE'],
    { input: enc, maxBuffer: MAXBUF, env: process.env },
  );

  const tmpDir = os.tmpdir();
  const dumpFile = path.join(tmpDir, `clb-restore-${Date.now()}.dump`);
  fs.writeFileSync(dumpFile, dump);

  try {
    const plan = restoreCommand();
    console.error(`Restoring via ${plan.kind} into ${TARGET.replace(/:[^:@/]+@/, ':***@')} …`);
    const restoreArgs = [
      '-Fc',
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--dbname',
      TARGET,
      dumpFile,
    ];
    const [cmd, args] =
      plan.kind === 'docker'
        ? ['docker', ['run', '--rm', '-v', `${tmpDir}:${tmpDir}`, plan.image, 'pg_restore', ...restoreArgs]]
        : ['pg_restore', restoreArgs];
    execFileSync(cmd, args, { maxBuffer: MAXBUF, stdio: ['ignore', 'inherit', 'inherit'] });
    console.error('Restore complete.');
  } finally {
    fs.rmSync(dumpFile, { force: true });
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
