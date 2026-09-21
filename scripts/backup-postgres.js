import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const connectionUrl = process.env.DIRECT_URL;
const destination = resolve(process.env.BACKUP_FILE || 'backups/pulso-public.dump');
const temporary = `${destination}.partial`;

if (!connectionUrl) throw new Error('DIRECT_URL must be injected by the secret manager.');
if (existsSync(destination) && process.env.ALLOW_BACKUP_OVERWRITE !== 'true') {
  throw new Error(`Backup already exists: ${destination}. Set ALLOW_BACKUP_OVERWRITE=true to replace it.`);
}

rmSync(temporary, { force: true });
mkdirSync(dirname(destination), { recursive: true });
const result = spawnSync(
  'pg_dump',
  [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--schema=public',
    '--file',
    temporary,
    connectionUrl,
  ],
  { stdio: ['ignore', 'inherit', 'inherit'], shell: false }
);

if (result.error) throw result.error;
if (result.status !== 0) {
  rmSync(temporary, { force: true });
  throw new Error(`pg_dump failed with exit code ${result.status}.`);
}

renameSync(temporary, destination);
const hash = createHash('sha256');
for await (const chunk of createReadStream(destination)) hash.update(chunk);
writeFileSync(`${destination}.sha256`, `${hash.digest('hex')}  ${destination.split(/[\\/]/).pop()}\n`, {
  mode: 0o600,
});
console.log(`Backup created: ${destination}`);
