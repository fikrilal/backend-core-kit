import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

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
      process.stdout.write(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array));
    });
    child.stderr.on('data', (chunk: unknown) => {
      stderr = append(stderr, chunk);
      process.stderr.write(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array));
    });

    child.on('error', (err) => {
      rejectRun(err);
    });
    child.on('close', (code) => {
      resolveRun({ code, stdout, stderr });
    });
  });
}

async function runNpm(
  args: ReadonlyArray<string>,
  env?: NodeJS.ProcessEnv,
  label?: string,
): Promise<void> {
  const name = label ?? ['npm', ...args].join(' ');
  process.stdout.write(`\n[scaffold-smoke] ${name}\n`);
  const result =
    process.platform === 'win32'
      ? await run('cmd.exe', ['/d', '/s', '/c', 'npm', ...args], env)
      : await run('npm', args, env);

  if (result.code !== 0) {
    throw new Error(`${name} failed with exit code ${String(result.code)}`);
  }
}

async function main(): Promise<void> {
  const featureName = `scaffold-smoke-${randomUUID().slice(0, 8)}`;
  const featureDir = resolve(process.cwd(), 'libs', 'features', featureName);
  const e2eSpecPath = resolve(process.cwd(), 'test', `${featureName}.e2e-spec.ts`);

  process.stdout.write(`[scaffold-smoke] feature=${featureName}\n`);

  try {
    await runNpm(
      ['run', 'scaffold:feature', '--', '--name', featureName, '--with-queue'],
      process.env,
      'scaffold feature',
    );
    await runNpm(['run', 'lint'], process.env, 'lint');
    await runNpm(['run', 'typecheck'], process.env, 'typecheck');
    await runNpm(['run', 'deps:check'], process.env, 'deps:check');
  } finally {
    await rm(featureDir, { recursive: true, force: true });
    await rm(e2eSpecPath, { force: true });
    process.stdout.write(`[scaffold-smoke] cleaned ${featureName}\n`);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
