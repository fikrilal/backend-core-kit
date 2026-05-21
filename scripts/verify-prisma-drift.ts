import { spawn } from 'node:child_process';

type CommandResult = Readonly<{
  stdout: string;
}>;

function npmCommand(): Readonly<{ command: string; args: ReadonlyArray<string> }> {
  if (process.platform === 'win32') {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm'] };
  }
  return { command: 'npm', args: [] };
}

async function runInherited(
  title: string,
  command: string,
  args: ReadonlyArray<string>,
): Promise<void> {
  process.stdout.write(`==> ${title}\n`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${title} exited with signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${title} exited with code ${code ?? 'unknown'}`));
        return;
      }
      resolve();
    });
  });
}

async function runCapture(command: string, args: ReadonlyArray<string>): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: unknown) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk: unknown) => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(' ')} exited with signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}\n${stderr}`,
          ),
        );
        return;
      }
      resolve({ stdout });
    });
  });
}

async function trackedStatusLines(): Promise<ReadonlyArray<string>> {
  const result = await runCapture('git', ['status', '--porcelain=v1', '--untracked-files=no']);
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line !== '')
    .sort((a, b) => a.localeCompare(b));
}

function newStatusLines(
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const beforeSet = new Set(before);
  return after.filter((line) => !beforeSet.has(line));
}

async function main(): Promise<void> {
  const npm = npmCommand();

  await runInherited('Prisma schema validation', npm.command, [
    ...npm.args,
    'run',
    'prisma:validate',
  ]);

  const before = await trackedStatusLines();
  await runInherited('Prisma client generation drift check', npm.command, [
    ...npm.args,
    'run',
    'prisma:generate',
  ]);
  const after = await trackedStatusLines();
  const introduced = newStatusLines(before, after);

  if (introduced.length > 0) {
    throw new Error(
      [
        'Prisma generate changed tracked files. Commit generated artifacts or fix drift.',
        ...introduced.map((line) => `- ${line}`),
      ].join('\n'),
    );
  }

  process.stdout.write('Prisma drift verification completed\n');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
