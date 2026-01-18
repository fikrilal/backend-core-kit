import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

type RunResult = Readonly<{
  code: number | null;
  stdout: string;
  stderr: string;
}>;

async function run(
  cmd: string,
  args: ReadonlyArray<string>,
  env?: NodeJS.ProcessEnv,
): Promise<RunResult> {
  return await new Promise<RunResult>((resolveRun, rejectRun) => {
    const child = spawn(cmd, [...args], {
      env: env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    const append = (target: string, chunk: unknown): string => {
      if (typeof chunk === 'string') return target + chunk;
      if (chunk instanceof Buffer) return target + chunk.toString('utf8');
      return target + Buffer.from(chunk as Uint8Array).toString('utf8');
    };

    child.stdout.on('data', (chunk: unknown) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk: unknown) => {
      stderr = append(stderr, chunk);
    });

    child.on('error', (err) => {
      rejectRun(err);
    });
    child.on('close', (code) => {
      resolveRun({ code, stdout, stderr });
    });
  });
}

async function runNpm(args: ReadonlyArray<string>, env?: NodeJS.ProcessEnv): Promise<RunResult> {
  if (process.platform === 'win32') {
    return await run('cmd.exe', ['/d', '/s', '/c', 'npm', ...args], env);
  }
  return await run('npm', args, env);
}

function assertGateFailed(name: string, res: RunResult, expectedSubstring?: string): void {
  if (res.code === 0) {
    throw new Error(`${name} unexpectedly succeeded; gate may be ineffective`);
  }

  if (expectedSubstring) {
    const out = `${res.stdout}\n${res.stderr}`;
    if (!out.includes(expectedSubstring)) {
      throw new Error(
        `${name} failed but did not include expected marker "${expectedSubstring}". Output:\n${out}`,
      );
    }
  }
}

async function maybeRemoveEmptyDir(path: string): Promise<void> {
  try {
    const entries = await readdir(path);
    if (entries.length === 0) {
      await rm(path);
    }
  } catch {
    // ignore
  }
}

async function main(): Promise<void> {
  // 1) OpenAPI snapshot gate honesty: prove openapi:check fails when snapshot is stale.
  const tmp = await mkdtemp(join(tmpdir(), 'backend-core-kit-gates-'));
  try {
    const badSnapshotPath = join(tmp, 'openapi.yaml');
    await writeFile(
      badSnapshotPath,
      [
        '# intentionally wrong snapshot',
        'openapi: 3.0.0',
        'info:',
        '  title: wrong',
        '  version: 0.0.0',
        'paths: {}',
        '',
      ].join('\n'),
      'utf8',
    );

    const openapiRes = await runNpm(['run', 'openapi:check'], {
      ...process.env,
      OPENAPI_CHECK_SNAPSHOT_PATH: badSnapshotPath,
      NODE_ENV: process.env.NODE_ENV ?? 'development',
    });
    assertGateFailed('openapi:check', openapiRes, 'OpenAPI snapshot is out of date');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  // 2) Dependency boundary gate honesty: prove deps:check fails on a known forbidden import.
  const violationFilePath = resolve(
    process.cwd(),
    'libs',
    'platform',
    '__gates__',
    `deps-check.violation.${randomUUID()}.ts`,
  );
  await mkdir(dirname(violationFilePath), { recursive: true });

  try {
    await writeFile(
      violationFilePath,
      [
        "import { AuthModule } from '../../features/auth/infra/auth.module';",
        '',
        'export const gate = AuthModule;',
        '',
      ].join('\n'),
      'utf8',
    );

    const depsRes = await runNpm(['run', 'deps:check'], process.env);
    assertGateFailed('deps:check', depsRes, 'platform-must-not-depend-on-features');
  } finally {
    await rm(violationFilePath, { force: true });
    await maybeRemoveEmptyDir(dirname(violationFilePath));
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
