import { spawn } from 'node:child_process';

async function run(cmd: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${cmd} ${args.join(' ')} exited with signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
        return;
      }
      resolve();
    });
  });
}

type CapturedRun = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

async function runCapture(cmd: string, args: string[]): Promise<CapturedRun> {
  return await new Promise<CapturedRun>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: unknown) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk: unknown) => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function dumpComposeLogs(service: 'postgres' | 'redis'): Promise<void> {
  try {
    await run('docker', ['compose', 'logs', service]);
  } catch {
    // best-effort only; ignore failures (e.g., compose not available)
  }
}

async function waitForPostgres(maxAttempts = 30, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= maxAttempts; i++) {
    const res = await runCapture('docker', [
      'compose',
      'exec',
      '-T',
      'postgres',
      'pg_isready',
      '-U',
      'postgres',
      '-d',
      'backend_core_kit',
    ]);

    if (res.signal) {
      throw new Error(`docker compose exec postgres pg_isready exited with signal ${res.signal}`);
    }

    if (res.code === 0) {
      process.stdout.write('Postgres is ready\n');
      return;
    }

    process.stdout.write(`Waiting for Postgres... (${i}/${maxAttempts})\n`);
    await sleep(delayMs);
  }

  process.stderr.write('Postgres did not become ready in time\n');
  await dumpComposeLogs('postgres');
  throw new Error('Postgres did not become ready in time');
}

async function waitForRedis(maxAttempts = 30, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= maxAttempts; i++) {
    const res = await runCapture('docker', ['compose', 'exec', '-T', 'redis', 'redis-cli', 'ping']);

    if (res.signal) {
      throw new Error(`docker compose exec redis redis-cli ping exited with signal ${res.signal}`);
    }

    if (res.code === 0 && res.stdout.trim() === 'PONG') {
      process.stdout.write('Redis is ready\n');
      return;
    }

    process.stdout.write(`Waiting for Redis... (${i}/${maxAttempts})\n`);
    await sleep(delayMs);
  }

  process.stderr.write('Redis did not become ready in time\n');
  await dumpComposeLogs('redis');
  throw new Error('Redis did not become ready in time');
}

async function waitForMinio(maxAttempts = 60, delayMs = 1000): Promise<void> {
  const endpoint = process.env.STORAGE_S3_ENDPOINT?.trim() || 'http://127.0.0.1:59090';
  const healthUrl = `${endpoint.replace(/\/$/, '')}/minio/health/ready`;

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        process.stdout.write('MinIO is ready\n');
        return;
      }
    } catch {
      // keep retrying
    }

    process.stdout.write(`Waiting for MinIO... (${i}/${maxAttempts})\n`);
    await sleep(delayMs);
  }

  throw new Error('MinIO did not become ready in time');
}

function setDefaultTestStorageEnv(): void {
  process.env.STORAGE_S3_ENDPOINT ??= 'http://127.0.0.1:59090';
  process.env.STORAGE_S3_REGION ??= 'us-east-1';
  process.env.STORAGE_S3_BUCKET ??= 'backend-core-kit';
  process.env.STORAGE_S3_ACCESS_KEY_ID ??= 'minioadmin';
  process.env.STORAGE_S3_SECRET_ACCESS_KEY ??= 'minioadmin';
  process.env.STORAGE_S3_FORCE_PATH_STYLE ??= 'true';
}

async function main(): Promise<void> {
  setDefaultTestStorageEnv();

  const npm = 'npm';
  let depsAttempted = false;
  try {
    depsAttempted = true;
    process.stdout.write('==> deps:up\n');
    await run(npm, ['run', 'deps:up']);

    process.stdout.write('==> wait:postgres\n');
    await waitForPostgres();

    process.stdout.write('==> wait:redis\n');
    await waitForRedis();

    process.stdout.write('==> wait:minio\n');
    await waitForMinio();

    process.stdout.write('==> prisma:migrate:deploy\n');
    await run(npm, ['run', 'prisma:migrate:deploy']);

    process.stdout.write('==> test:int\n');
    await run(npm, ['run', 'test:int']);

    process.stdout.write('==> test:e2e\n');
    await run(npm, ['run', 'test:e2e']);
  } finally {
    if (!depsAttempted) return;
    try {
      process.stdout.write('==> deps:down\n');
      await run(npm, ['run', 'deps:down']);
    } catch (err: unknown) {
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      process.stderr.write(`Failed to stop local dependencies (deps:down): ${msg}\n`);
    }
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
