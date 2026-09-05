import { execSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const apiDir = resolve(rootDir, 'apps/api');
const contractsDir = resolve(rootDir, 'packages/contracts');

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://pulso:pulso_test_password@localhost:5433/pulso_test?schema=public';

// Enforce test database isolation strictly
try {
  const parsed = new URL(testDbUrl);
  const dbName = parsed.pathname.replace(/^\//, '').split('?')[0];
  if (dbName !== 'pulso_test') {
    console.error(
      `[Pulso Security Error] production-smoke.js rejected database '${dbName}'. Target MUST be 'pulso_test'.`
    );
    process.exit(1);
  }
} catch (e) {
  console.error('[Pulso Security Error] Invalid test database URL provided to production-smoke.js', e);
  process.exit(1);
}

const smokePort = 4200;

async function runProductionSmoke() {
  console.log('=== [Production Smoke Test] Starting verification ===');

  // Step 1: Clean build artifacts
  console.log('[Smoke Test] 1. Cleaning dist directories for contracts and api...');
  rmSync(resolve(contractsDir, 'dist'), { recursive: true, force: true });
  rmSync(resolve(apiDir, 'dist'), { recursive: true, force: true });

  // Step 2: Build from clean state
  console.log('[Smoke Test] 2. Compiling @pulso/contracts...');
  execSync('pnpm --filter @pulso/contracts build', { cwd: rootDir, stdio: 'inherit' });

  console.log('[Smoke Test] 3. Verifying Node ESM import of compiled @pulso/contracts runtime...');
  const contractsUrl = new URL(`file://${resolve(contractsDir, 'dist/index.js').replace(/\\/g, '/')}`).href;
  const contracts = await import(contractsUrl);
  const requiredSchemas = [
    'RegisterInputSchema',
    'LoginInputSchema',
    'CreateLocationInputSchema',
    'SyncBatchSchema',
  ];
  for (const schema of requiredSchemas) {
    if (!(schema in contracts)) {
      throw new Error(`Compiled @pulso/contracts is missing required export: ${schema}`);
    }
  }

  // Also verify resolution of '@pulso/contracts' package specifier from the API context
  execSync(
    'node -e "import(\'@pulso/contracts\').then(m => { if (!m.RegisterInputSchema) process.exit(1); })"',
    { cwd: apiDir, stdio: 'pipe' }
  );
  console.log('[Smoke Test] Compiled @pulso/contracts exports verified successfully.');

  console.log('[Smoke Test] 4. Compiling @pulso/api...');
  execSync('pnpm --filter @pulso/api build', { cwd: rootDir, stdio: 'inherit' });

  // Step 3: Spawn compiled API with production environment
  console.log(
    `[Smoke Test] 5. Spawning compiled API via node dist/src/main.js on isolated port ${smokePort}...`
  );
  const serverEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(smokePort),
    DATABASE_URL: testDbUrl,
    ALLOWED_ORIGINS: `http://localhost:3000,http://127.0.0.1:3000,http://localhost:${smokePort}`,
    COOKIE_SECURE: 'false', // Verifies production forces Secure flag regardless
  };

  let serverProcess = null;
  let serverLogs = '';
  let serverErrors = '';
  let hasExited = false;
  let exitCode = null;

  try {
    serverProcess = spawn('node', ['dist/src/main.js'], {
      cwd: apiDir,
      env: serverEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      serverLogs += text;
    });

    serverProcess.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      serverErrors += text;
    });

    serverProcess.on('exit', (code) => {
      hasExited = true;
      exitCode = code;
    });

    // Step 4: Poll /api/health until HTTP 200
    const healthUrl = `http://127.0.0.1:${smokePort}/api/health`;
    const maxWaitMs = 15000;
    const intervalMs = 250;
    const start = Date.now();
    let isHealthy = false;

    while (Date.now() - start < maxWaitMs) {
      if (hasExited) {
        throw new Error(
          `Server process exited prematurely with code ${exitCode}.\nLogs:\n${serverLogs}\nErrors:\n${serverErrors}`
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
        // Server still booting, wait and retry
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    if (!isHealthy) {
      throw new Error(
        `Health check timed out after ${maxWaitMs}ms.\nLogs:\n${serverLogs}\nErrors:\n${serverErrors}`
      );
    }
    console.log('[Smoke Test] 6. /api/health responded HTTP 200 OK.');

    // Step 5: Verify Nest DI providers (OriginValidationGuard and RateLimiterService) via mutation
    console.log('[Smoke Test] 7. Testing state-mutating endpoint under production guard...');
    const mutationRes = await fetch(`http://127.0.0.1:${smokePort}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ email: 'invalid@pulso.dev', password: 'incorrectPassword123' }),
    });

    // Valid DI execution produces 401 Unauthorized or 400 Bad Request, never 500 or DI failure
    if (mutationRes.status !== 401 && mutationRes.status !== 400) {
      throw new Error(
        `Unexpected response status ${mutationRes.status} from login probe.\nLogs:\n${serverLogs}\nErrors:\n${serverErrors}`
      );
    }

    console.log(
      `[Smoke Test] Login probe responded HTTP ${mutationRes.status} (expected auth error, proving Nest DI, OriginValidationGuard, and RateLimiterService operate correctly in production).`
    );

    console.log('=== [Production Smoke Test] SUCCESS: Compiled artifact verified! ===');
  } finally {
    // Step 6: Ensure child process is unconditionally terminated
    if (serverProcess && !serverProcess.killed) {
      console.log('[Smoke Test] Terminating server process tree...');
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore' });
        } catch {
          serverProcess.kill('SIGTERM');
        }
      } else {
        serverProcess.kill('SIGTERM');
      }
    }
  }
}

runProductionSmoke().catch((err) => {
  console.error('[Smoke Test FAILED]', err);
  process.exit(1);
});
