import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type RunResult = Readonly<{
  code: number | null;
  stdout: string;
  stderr: string;
}>;

function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

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
  const runId = randomUUID().slice(0, 8);
  const simpleFeatureName = `scaffold-smoke-simple-${runId}`;
  const cleanFeatureName = `scaffold-smoke-clean-${runId}`;
  const generatedPaths = [
    resolve(process.cwd(), 'libs', 'features', simpleFeatureName),
    resolve(process.cwd(), 'libs', 'features', cleanFeatureName),
    resolve(process.cwd(), 'test', `${simpleFeatureName}.e2e-spec.ts`),
    resolve(process.cwd(), 'test', `${cleanFeatureName}.e2e-spec.ts`),
  ];
  const appModulePath = resolve(process.cwd(), 'apps', 'api', 'src', 'app.module.ts');
  const originalAppModule = await readFile(appModulePath, 'utf8');

  process.stdout.write(`[scaffold-smoke] simple=${simpleFeatureName} clean=${cleanFeatureName}\n`);

  try {
    await runNpm(
      ['run', 'scaffold:feature', '--', '--name', simpleFeatureName, '--with-queue'],
      process.env,
      'scaffold simple feature',
    );
    await runNpm(
      [
        'run',
        'scaffold:feature',
        '--',
        '--name',
        cleanFeatureName,
        '--tier',
        'clean',
        '--with-queue',
      ],
      process.env,
      'scaffold clean feature',
    );

    const simpleModuleName = `${toPascalCase(simpleFeatureName)}Module`;
    const cleanModuleName = `${toPascalCase(cleanFeatureName)}Module`;

    const importsToAdd = [
      `import { ${simpleModuleName} } from '../../../libs/features/${simpleFeatureName}/${simpleFeatureName}.module';`,
      `import { ${cleanModuleName} } from '../../../libs/features/${cleanFeatureName}/infra/${cleanFeatureName}.module';`,
    ].join('\n');

    const arrayWiring = `MerchantOnboardingModule,\n    ${simpleModuleName},\n    ${cleanModuleName},`;
    let wiredAppModule = originalAppModule.replace('@Module({', `${importsToAdd}\n@Module({`);
    wiredAppModule = wiredAppModule.replace('MerchantOnboardingModule,', arrayWiring);
    if (!wiredAppModule.includes(importsToAdd) || !wiredAppModule.includes(arrayWiring)) {
      throw new Error(
        'Failed to wire smoke feature modules into app.module.ts; wiring anchors may have changed',
      );
    }
    await writeFile(appModulePath, wiredAppModule, 'utf8');

    await runNpm(['run', 'lint'], process.env, 'lint (wired)');
    await runNpm(['run', 'typecheck'], process.env, 'typecheck (wired)');
    await runNpm(['run', 'deps:check'], process.env, 'deps:check (wired)');

    await runNpm(
      ['run', 'remove:feature', '--', simpleFeatureName, '--yes', '--force'],
      process.env,
      'remove simple feature',
    );
    await runNpm(
      ['run', 'remove:feature', '--', cleanFeatureName, '--yes', '--force'],
      process.env,
      'remove clean feature',
    );

    for (const p of generatedPaths) {
      if (await pathExists(p)) {
        throw new Error(`Expected path to be deleted by feature removal: ${p}`);
      }
    }

    const unwiredAppModule = await readFile(appModulePath, 'utf8');
    if (
      unwiredAppModule.includes(simpleModuleName) ||
      unwiredAppModule.includes(cleanModuleName) ||
      unwiredAppModule.includes(simpleFeatureName) ||
      unwiredAppModule.includes(cleanFeatureName)
    ) {
      throw new Error('app.module.ts still contains references to removed feature modules');
    }

    await runNpm(['run', 'lint'], process.env, 'lint (unwired)');
    await runNpm(['run', 'typecheck'], process.env, 'typecheck (unwired)');
    await runNpm(['run', 'deps:check'], process.env, 'deps:check (unwired)');
  } finally {
    try {
      const current = await readFile(appModulePath, 'utf8');
      if (current !== originalAppModule) {
        await writeFile(appModulePath, originalAppModule, 'utf8');
      }
    } catch {
      // ignore
    }
    for (const path of generatedPaths) {
      await rm(path, { recursive: true, force: true });
    }
    process.stdout.write(`[scaffold-smoke] cleaned ${runId}\n`);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
