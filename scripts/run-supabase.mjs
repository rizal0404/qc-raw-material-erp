import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const stagingProjectRef = 'tejxcxlpoksittppontc';
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || stagingProjectRef;
const databaseUrl = process.env.SUPABASE_DATABASE_URL?.trim();

if (!databaseUrl) throw new Error('SUPABASE_DATABASE_URL is required');

const parsed = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
  throw new Error('SUPABASE_DATABASE_URL must use postgres:// or postgresql://');
}

const directMatch = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(parsed.hostname);
const poolerMatch = /^postgres\.([a-z0-9]+)$/i.exec(decodeURIComponent(parsed.username));
const urlProjectRef = directMatch?.[1] ?? poolerMatch?.[1];
if (urlProjectRef !== projectRef) {
  throw new Error(`Refusing Supabase task: expected project ${projectRef}, received ${urlProjectRef ?? 'unknown'}`);
}

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const taskName = process.argv[2];
const apiPort = process.env.SUPABASE_API_PORT?.trim() || '3137';
const webPort = process.env.SUPABASE_WEB_PORT?.trim() || '5174';
const apiDevTask = {
  cwd: resolve(repositoryRoot, 'apps/api'),
  args: ['--import=tsx', '--watch', 'src/server.ts'],
  env: {
    DATABASE_TARGET: 'supabase',
    API_PORT: apiPort,
  },
};
const webDevTask = {
  cwd: resolve(repositoryRoot, 'apps/web'),
  args: [resolve(repositoryRoot, 'apps/web/node_modules/vite/bin/vite.js'), '--port', webPort],
  env: {
    VITE_API_BASE_URL: `http://localhost:${apiPort}/api/v1`,
  },
};
const tasks = {
  'app:dev': [apiDevTask, webDevTask],
  'api:dev': [apiDevTask],
  'api:start': [{
    cwd: resolve(repositoryRoot, 'apps/api'),
    args: ['dist/server.js'],
    env: {
      DATABASE_TARGET: 'supabase',
      ...(process.env.SUPABASE_API_PORT?.trim() ? { API_PORT: process.env.SUPABASE_API_PORT.trim() } : {}),
    },
  }],
  'bootstrap:admin': [{
    cwd: resolve(repositoryRoot, 'apps/api'),
    args: ['--import=tsx', 'src/scripts/bootstrap-admin.ts'],
    env: { DATABASE_TARGET: 'supabase' },
  }],
  'db:migrate': [{
    cwd: resolve(repositoryRoot, 'packages/db'),
    args: ['--import=tsx', 'src/migrate.ts'],
    env: {
      MIGRATION_DATABASE_TARGET: 'supabase',
      MIGRATION_EXPECTED_PROJECT_REF: projectRef,
    },
  }],
  'db:verify': [{
    cwd: resolve(repositoryRoot, 'packages/db'),
    args: ['--import=tsx', 'src/verify-migrations.ts'],
    env: {
      MIGRATION_DATABASE_TARGET: 'supabase',
      MIGRATION_EXPECTED_PROJECT_REF: projectRef,
    },
  }],
};

const taskProcesses = tasks[taskName];
if (!taskProcesses) {
  throw new Error(`Unknown Supabase task: ${taskName ?? '(missing)'}`);
}

console.log(`Supabase task ${taskName}: ${parsed.hostname}:${parsed.port || '5432'}/postgres (${projectRef})`);
const children = taskProcesses.map((task) => spawn(process.execPath, task.args, {
    cwd: task.cwd,
    env: { ...process.env, ...task.env },
    stdio: 'inherit',
  }));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
}

let remainingChildren = children.length;
for (const child of children) {
  child.on('error', (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if ((code ?? (signal ? 1 : 0)) !== 0) {
      process.exitCode = code ?? 1;
      for (const sibling of children) {
        if (sibling !== child && !sibling.killed) sibling.kill();
      }
    }
    remainingChildren -= 1;
    if (remainingChildren === 0 && process.exitCode === undefined) process.exitCode = 0;
  });
}
