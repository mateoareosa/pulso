import { execSync, spawn } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const apiDir = resolve(rootDir, 'apps/api');
const contractsDir = resolve(rootDir, 'packages/contracts');

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://pulso:pulso_test_password@localhost:5433/pulso_test?schema=public';

// Strict validation of target database name
try {
  const parsed = new URL(testDbUrl);
  const dbName = parsed.pathname.replace(/^\//, '').split('?')[0];
  if (dbName !== 'pulso_test') {
    console.error(
      `[Pulso Security Error] development-smoke.js rejected database '${dbName}'. Target MUST be 'pulso_test'.`
    );
    process.exit(1);
  }
} catch (e) {
  console.error('[Pulso Security Error] Invalid database URL provided to development-smoke.js', e);
  process.exit(1);
}

const smokePort = 4300;

async function runDevelopmentSmoke() {
  console.log('=== [Development Smoke Test] Starting verification ===');

  // Step 1: Ensure clean state by removing contracts dist completely
  console.log('[Smoke Test] 1. Removing packages/contracts/dist and apps/api/dist...');
  rmSync(resolve(contractsDir, 'dist'), { recursive: true, force: true });
  rmSync(resolve(apiDir, 'dist'), { recursive: true, force: true });

  if (existsSync(resolve(contractsDir, 'dist'))) {
    throw new Error('Failed to remove packages/contracts/dist prior to test.');
  }
  console.log('[Smoke Test] packages/contracts/dist confirmed absent.');

  // Step 2: Spawn official development flow for API on isolated port 4300
  console.log(
    `[Smoke Test] 2. Spawning official dev command (pnpm --filter @pulso/api dev) on port ${smokePort}...`
  );

  const devEnv = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(smokePort),
    DATABASE_URL: testDbUrl,
    ALLOWED_ORIGINS: `http://localhost:3000,http://127.0.0.1:3000,http://localhost:${smokePort}`,
  };

  let devProcess = null;
  let serverLogs = '';
  let serverErrors = '';
  let hasExited = false;
  let exitCode = null;

  try {
    // Run pnpm --filter @pulso/api dev (triggers predev build if needed and launches tsx watch with development condition)
    const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    devProcess = spawn(pnpmCmd, ['--filter', '@pulso/api', 'dev'], {
      cwd: rootDir,
      env: devEnv,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    devProcess.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      serverLogs += text;
    });

    devProcess.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      serverErrors += text;
    });

    devProcess.on('exit', (code) => {
      hasExited = true;
      exitCode = code;
    });

    // Step 3: Poll /api/health until HTTP 200
    const healthUrl = `http://127.0.0.1:${smokePort}/api/health`;
    const maxWaitMs = 20000;
    const intervalMs = 250;
    const start = Date.now();
    let isHealthy = false;

    while (Date.now() - start < maxWaitMs) {
      if (hasExited) {
        throw new Error(
          `Dev process exited prematurely with code ${exitCode}.\nLogs:\n${serverLogs}\nErrors:\n${serverErrors}`
        );
      }

      try {
        const res = await fetch(healthUrl);
        if (res.status === 200) {
          const body = await res.json();
          if (body?.status === 'ok') {
            isHealthy = true;
            break;
          }
        }
      } catch {
        // Still booting, wait and retry
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    if (!isHealthy) {
      throw new Error(
        `Health check timed out after ${maxWaitMs}ms on ${healthUrl}.\nLogs:\n${serverLogs}\nErrors:\n${serverErrors}`
      );
    }

    console.log('[Smoke Test] 3. /api/health responded HTTP 200 OK in development mode.');
    console.log('=== [Development Smoke Test] SUCCESS: Development boot verified! ===');
  } finally {
    // Step 4: Terminate the entire process tree reliably
    if (devProcess && !devProcess.killed) {
      console.log('[Smoke Test] Terminating dev process tree...');
      if (process.platform === 'win32' && devProcess.pid) {
        try {
          execSync(`taskkill /pid ${devProcess.pid} /T /F`, { stdio: 'ignore' });
        } catch {
          devProcess.kill('SIGTERM');
        }
      } else {
        devProcess.kill('SIGTERM');
      }
    }
  }
}

runDevelopmentSmoke().catch((err) => {
  console.error('[Development Smoke FAILED]', err);
  process.exit(1);
});
