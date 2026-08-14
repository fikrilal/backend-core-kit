import {
  npmInvocation,
  systemProcessRunner,
  type ProcessInvocation,
  type ProcessResult,
} from '../tools/backendkit/process-runner';

async function run(invocation: ProcessInvocation): Promise<void> {
  const result = await systemProcessRunner.run({
    ...invocation,
    stdio: 'inherit',
  });
  if (result.signal) {
    throw new Error(
      `${invocation.command} ${invocation.args.join(' ')} exited with signal ${result.signal}`,
    );
  }
  if (result.code !== 0) {
    throw new Error(
      `${invocation.command} ${invocation.args.join(' ')} exited with code ${result.code ?? 'unknown'}`,
    );
  }
}

async function runCapture(command: string, args: ReadonlyArray<string>): Promise<ProcessResult> {
  return await systemProcessRunner.run({ command, args, stdio: 'pipe' });
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function dumpComposeLogs(service: 'postgres' | 'redis'): Promise<void> {
  try {
    await run({ command: 'docker', args: ['compose', 'logs', service] });
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

  let depsAttempted = false;
  try {
    depsAttempted = true;
    process.stdout.write('==> deps:up\n');
    await run(npmInvocation(['run', 'deps:up']));

    process.stdout.write('==> wait:postgres\n');
    await waitForPostgres();

    process.stdout.write('==> wait:redis\n');
    await waitForRedis();

    process.stdout.write('==> wait:minio\n');
    await waitForMinio();

    process.stdout.write('==> prisma:migrate:deploy\n');
    await run(npmInvocation(['run', 'prisma:migrate:deploy']));

    process.stdout.write('==> prisma:migrate:status\n');
    await run(npmInvocation(['run', 'prisma:migrate:status']));

    process.stdout.write('==> test:int\n');
    await run(npmInvocation(['run', 'test:int']));

    process.stdout.write('==> test:e2e\n');
    await run(npmInvocation(['run', 'test:e2e']));
  } finally {
    if (!depsAttempted) return;
    try {
      process.stdout.write('==> deps:down\n');
      await run(npmInvocation(['run', 'deps:down']));
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
