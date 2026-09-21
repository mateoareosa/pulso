import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const connectionUrl = process.env.RESTORE_DATABASE_URL;
const backup = resolve(process.env.BACKUP_FILE || 'backups/pulso-public.dump');

if (!connectionUrl) throw new Error('RESTORE_DATABASE_URL must be injected by the secret manager.');
if (!existsSync(backup)) throw new Error(`Backup file not found: ${backup}`);

const parsed = new URL(connectionUrl);
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
if (!databaseName || process.env.RESTORE_CONFIRM_DATABASE !== databaseName) {
  throw new Error('RESTORE_CONFIRM_DATABASE must exactly match the target database name.');
}

const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
if (!localHosts.has(parsed.hostname) && process.env.RESTORE_ALLOW_REMOTE !== 'true') {
  throw new Error('Remote restore refused. Set RESTORE_ALLOW_REMOTE=true only after an explicit review.');
}

const checksumFile = `${backup}.sha256`;
if (!existsSync(checksumFile)) throw new Error(`Checksum file not found: ${checksumFile}`);
const expected = readFileSync(checksumFile, 'utf8').trim().split(/\s+/)[0];
const hash = createHash('sha256');
for await (const chunk of createReadStream(backup)) hash.update(chunk);
if (hash.digest('hex') !== expected) throw new Error('Backup checksum verification failed.');

const result = spawnSync(
  'pg_restore',
  [
    '--exit-on-error',
    '--single-transaction',
    '--no-owner',
    '--no-privileges',
    '--dbname',
    connectionUrl,
    backup,
  ],
  { stdio: ['ignore', 'inherit', 'inherit'], shell: false }
);

if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`pg_restore failed with exit code ${result.status}.`);
console.log(`Restore completed into confirmed database: ${databaseName}`);
