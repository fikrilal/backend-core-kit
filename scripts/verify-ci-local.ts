import { spawn } from 'node:child_process';

type VerifyStep = Readonly<{
  title: string;
  npmArgs: ReadonlyArray<string>;
}>;

const STEPS: ReadonlyArray<VerifyStep> = [
  { title: 'Prisma generate', npmArgs: ['run', 'prisma:generate'] },
  { title: 'Format check', npmArgs: ['run', 'format:check'] },
  { title: 'Lint', npmArgs: ['run', 'lint'] },
  { title: 'Typecheck', npmArgs: ['run', 'typecheck'] },
  { title: 'Environment example schema', npmArgs: ['run', 'verify:env'] },
  { title: 'Project map drift', npmArgs: ['run', 'verify:project-map'] },
  { title: 'Dependency boundaries', npmArgs: ['run', 'deps:check'] },
  { title: 'Scaffold smoke', npmArgs: ['run', 'scaffold:smoke'] },
  { title: 'Architecture smell scan', npmArgs: ['run', 'smells:arch:ci'] },
  { title: 'Duplication self-review report', npmArgs: ['run', 'duplication:report'] },
  { title: 'Unit tests', npmArgs: ['test'] },
  { title: 'OpenAPI snapshot gate', npmArgs: ['run', 'openapi:check'] },
  { title: 'OpenAPI Spectral lint', npmArgs: ['run', 'openapi:lint'] },
  { title: 'Gate honesty', npmArgs: ['run', 'verify:gates'] },
  { title: 'Runtime dependency vulnerability audit', npmArgs: ['run', 'audit:prod'] },
];

function npmCommand(): Readonly<{ command: string; args: ReadonlyArray<string> }> {
  if (process.platform === 'win32') {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm'] };
  }
  return { command: 'npm', args: [] };
}

async function runStep(step: VerifyStep): Promise<void> {
  const npm = npmCommand();
  const started = Date.now();
  const commandArgs = [...npm.args, ...step.npmArgs];

  process.stdout.write(`\n==> ${step.title}\n`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(npm.command, commandArgs, {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${step.title} exited with signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${step.title} exited with code ${code ?? 'unknown'}`));
        return;
      }
      resolve();
    });
  });

  const elapsedSeconds = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write(`==> ${step.title} completed in ${elapsedSeconds}s\n`);
}

async function main(): Promise<void> {
  for (const step of STEPS) {
    await runStep(step);
  }

  process.stdout.write('\nverify:ci-local completed successfully\n');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
