import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load .env from current dir or workspace root
const localEnv = resolve(process.cwd(), '.env');
const rootEnv = resolve(process.cwd(), '../../.env');

if (existsSync(localEnv)) {
  dotenv.config({ path: localEnv });
} else if (existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else {
  dotenv.config();
}

export default defineConfig({
  earlyAccess: true,
  schema: 'prisma/schema.prisma',
  seed: 'tsx prisma/seed.ts',
});
