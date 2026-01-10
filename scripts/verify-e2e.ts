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

async function main(): Promise<void> {
  const npm = 'npm';
  let depsAttempted = false;
  try {
    depsAttempted = true;
    process.stdout.write('==> deps:up\n');
    await run(npm, ['run', 'deps:up']);

    process.stdout.write('==> prisma:migrate:deploy\n');
    await run(npm, ['run', 'prisma:migrate:deploy']);

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
