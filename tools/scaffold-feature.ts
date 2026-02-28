import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

type CliOptions = Readonly<{
  name: string;
  withQueue: boolean;
  dryRun: boolean;
  force: boolean;
}>;

type FeatureNames = Readonly<{
  kebab: string;
  pascal: string;
  camel: string;
  upperSnake: string;
}>;

type ScaffoldFile = Readonly<{
  path: string;
  content: string;
}>;

function usage(): string {
  return [
    'Usage: npm run scaffold:feature -- --name <feature-name> [--with-queue] [--dry-run] [--force]',
    '',
    'Options:',
    '  --name <value>   Feature name (e.g. billing, user-preferences).',
    '  --with-queue     Include queue job skeleton files.',
    '  --dry-run        Print generated paths without writing files.',
    '  --force          Overwrite existing files.',
  ].join('\n');
}

function parseArgs(argv: string[]): CliOptions {
  let name: string | undefined;
  let withQueue = false;
  let dryRun = false;
  let force = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--name') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --name');
      }
      name = value;
      i += 1;
      continue;
    }

    if (arg === '--with-queue') {
      withQueue = true;
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--force') {
      force = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      throw new Error(usage());
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!name) throw new Error('Missing required argument --name');

  return { name, withQueue, dryRun, force };
}

function normalizeFeatureName(raw: string): string {
  const normalized = raw
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  if (normalized.length === 0) {
    throw new Error(`Invalid feature name: "${raw}"`);
  }

  return normalized;
}

function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function toCamelCase(kebab: string): string {
  const pascal = toPascalCase(kebab);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toUpperSnake(kebab: string): string {
  return kebab.replace(/-/g, '_').toUpperCase();
}

function buildFeatureNames(inputName: string): FeatureNames {
  const kebab = normalizeFeatureName(inputName);
  return {
    kebab,
    pascal: toPascalCase(kebab),
    camel: toCamelCase(kebab),
    upperSnake: toUpperSnake(kebab),
  };
}

function readIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function writeFile(path: string, content: string, force: boolean): void {
  const existing = readIfExists(path);
  if (existing !== undefined && !force) {
    throw new Error(`File already exists: ${path} (pass --force to overwrite)`);
  }
  ensureDir(dirname(path));
  writeFileSync(path, content, 'utf8');
}

function buildFiles(names: FeatureNames, withQueue: boolean): ScaffoldFile[] {
  const base = join('libs', 'features', names.kebab);
  const serviceClass = `${names.pascal}Service`;
  const errorClass = `${names.pascal}Error`;
  const errorCodeEnum = `${names.pascal}ErrorCode`;
  const errorCodeValue = `${names.pascal}ErrorCodeValue`;
  const repositoryInterface = `${names.pascal}Repository`;
  const repositoryClass = `Prisma${names.pascal}Repository`;
  const moduleClass = `${names.pascal}Module`;
  const controllerClass = `${names.pascal}Controller`;
  const filterClass = `${names.pascal}ErrorFilter`;
  const dtoClass = `${names.pascal}HealthDto`;
  const clockToken = `${names.upperSnake}_CLOCK`;
  const jobsClass = `${names.pascal}Jobs`;
  const queueNameConst = `${names.upperSnake}_QUEUE`;
  const queueJobConst = `${names.upperSnake}_SYNC_JOB`;

  const files: ScaffoldFile[] = [
    {
      path: join(base, 'app', `${names.kebab}.error-codes.ts`),
      content: `import { ErrorCode } from '../../../shared/error-codes';

export enum ${errorCodeEnum} {
  ${names.upperSnake}_NOT_IMPLEMENTED = '${names.upperSnake}_NOT_IMPLEMENTED',
}

export type ${errorCodeValue} = ${errorCodeEnum} | ErrorCode;
`,
    },
    {
      path: join(base, 'app', `${names.kebab}.errors.ts`),
      content: `import type { ${errorCodeValue} } from './${names.kebab}.error-codes';

export type ${names.pascal}Issue = Readonly<{ field?: string; message: string }>;

export class ${errorClass} extends Error {
  readonly status: number;
  readonly code: ${errorCodeValue};
  readonly issues?: ReadonlyArray<${names.pascal}Issue>;

  constructor(params: {
    status: number;
    code: ${errorCodeValue};
    message?: string;
    issues?: ReadonlyArray<${names.pascal}Issue>;
  }) {
    super(params.message ?? params.code);
    this.status = params.status;
    this.code = params.code;
    this.issues = params.issues;
  }
}
`,
    },
    {
      path: join(base, 'app', 'ports', `${names.kebab}.repository.ts`),
      content: `export interface ${repositoryInterface} {
  ping(): Promise<void>;
}
`,
    },
    {
      path: join(base, 'app', `${names.kebab}.service.ts`),
      content: `import { Injectable } from '@nestjs/common';
import type { Clock } from '../../../shared/time';
import type { ${repositoryInterface} } from './ports/${names.kebab}.repository';

@Injectable()
export class ${serviceClass} {
  constructor(
    private readonly repo: ${repositoryInterface},
    private readonly clock: Clock,
  ) {}

  async healthCheck(): Promise<Readonly<{ status: 'ok'; now: string }>> {
    await this.repo.ping();
    return { status: 'ok', now: this.clock.now().toISOString() };
  }
}
`,
    },
    {
      path: join(base, 'infra', `${names.kebab}.tokens.ts`),
      content: `export const ${clockToken} = Symbol('${clockToken}');
`,
    },
    {
      path: join(base, 'infra', 'persistence', `prisma-${names.kebab}.repository.ts`),
      content: `import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../platform/db/prisma.service';
import type { ${repositoryInterface} } from '../../app/ports/${names.kebab}.repository';

@Injectable()
export class ${repositoryClass} implements ${repositoryInterface} {
  constructor(private readonly prisma: PrismaService) {}

  async ping(): Promise<void> {
    await this.prisma.getClient().$queryRaw\`SELECT 1\`;
  }
}
`,
    },
    {
      path: join(base, 'infra', 'http', 'dtos', `${names.kebab}.dto.ts`),
      content: `import { ApiProperty } from '@nestjs/swagger';

export class ${dtoClass} {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  now!: string;
}
`,
    },
    {
      path: join(base, 'infra', 'http', `${names.kebab}-error.filter.ts`),
      content: `import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { mapFeatureErrorToProblem } from '../../../../platform/http/filters/feature-error.mapper';
import { ProblemDetailsFilter } from '../../../../platform/http/filters/problem-details.filter';
import { ${errorClass} } from '../../app/${names.kebab}.errors';

@Catch(${errorClass})
export class ${filterClass} implements ExceptionFilter {
  private readonly problemDetailsFilter = new ProblemDetailsFilter();

  catch(exception: ${errorClass}, host: ArgumentsHost): void {
    const mapped = mapFeatureErrorToProblem({
      status: exception.status,
      code: exception.code,
      detail: exception.message,
      issues: exception.issues,
      titleStrategy: 'status-default',
    });

    this.problemDetailsFilter.catch(mapped, host);
  }
}
`,
    },
    {
      path: join(base, 'infra', 'http', `${names.kebab}.controller.ts`),
      content: `import { Controller, Get, UseFilters } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { ${serviceClass} } from '../../app/${names.kebab}.service';
import { ${dtoClass} } from './dtos/${names.kebab}.dto';
import { ${filterClass} } from './${names.kebab}-error.filter';

@ApiTags('${names.pascal}')
@Controller('${names.kebab}')
@UseFilters(${filterClass})
export class ${controllerClass} {
  constructor(private readonly service: ${serviceClass}) {}

  @Get('health')
  @ApiOperation({
    operationId: '${names.kebab}.health.get',
    summary: 'Health check',
    description: 'Minimal endpoint scaffold for the ${names.kebab} feature.',
  })
  @ApiErrorCodes([ErrorCode.INTERNAL])
  @ApiOkResponse({ type: ${dtoClass} })
  async health(): Promise<${dtoClass}> {
    const result = await this.service.healthCheck();
    return {
      status: result.status,
      now: result.now,
    };
  }
}
`,
    },
    {
      path: join(base, 'infra', `${names.kebab}.module.ts`),
      content: `import { Module } from '@nestjs/common';
import {
  provideConstructedAppService,
  provideSystemClockToken,
} from '../../../platform/di/app-service.provider';
import { PrismaModule } from '../../../platform/db/prisma.module';
${withQueue ? "import { QueueModule } from '../../../platform/queue/queue.module';\n" : ''}import { ${serviceClass} } from '../app/${names.kebab}.service';
import { ${controllerClass} } from './http/${names.kebab}.controller';
import { ${filterClass} } from './http/${names.kebab}-error.filter';
import { ${repositoryClass} } from './persistence/prisma-${names.kebab}.repository';
import { ${clockToken} } from './${names.kebab}.tokens';
${withQueue ? `import { ${jobsClass} } from './jobs/${names.kebab}.jobs';\n` : ''}
@Module({
  imports: [
    PrismaModule,
${withQueue ? '    QueueModule,\n' : ''}  ],
  controllers: [${controllerClass}],
  providers: [
    ${repositoryClass},
    ${filterClass},
${withQueue ? `    ${jobsClass},\n` : ''}    provideSystemClockToken(${clockToken}),
    provideConstructedAppService({
      provide: ${serviceClass},
      inject: [${repositoryClass}, ${clockToken}],
      useClass: ${serviceClass},
    }),
  ],
  exports: [${serviceClass}],
})
export class ${moduleClass} {}
`,
    },
    {
      path: join(base, 'app', `${names.kebab}.service.spec.ts`),
      content: `import { ${serviceClass} } from './${names.kebab}.service';

describe('${serviceClass}', () => {
  it.todo('returns deterministic health check values');
  it.todo('propagates repository failures as feature errors when needed');
});
`,
    },
    {
      path: join(base, 'infra', 'persistence', `prisma-${names.kebab}.repository.spec.ts`),
      content: `import { ${repositoryClass} } from './prisma-${names.kebab}.repository';

describe('${repositoryClass}', () => {
  it.todo('implements ${repositoryInterface}.ping against Prisma');
});
`,
    },
    {
      path: join('test', `${names.kebab}.e2e-spec.ts`),
      content: `describe('${names.kebab} (e2e)', () => {
  it.todo('GET /v1/${names.kebab}/health returns 200');
});
`,
    },
  ];

  if (withQueue) {
    files.push(
      {
        path: join(base, 'infra', 'jobs', `${names.kebab}.job.ts`),
        content: `export const ${queueNameConst} = '${names.kebab}' as const;
export const ${queueJobConst} = '${names.kebab}.sync' as const;

export type ${names.pascal}SyncJobData = Readonly<{
  resourceId: string;
  enqueuedAt: string;
}>;
`,
      },
      {
        path: join(base, 'infra', 'jobs', `${names.kebab}.jobs.ts`),
        content: `import { Injectable } from '@nestjs/common';
import { QueueProducer } from '../../../../platform/queue/queue.producer';
import type { Clock } from '../../../../shared/time';
import { ${queueJobConst}, ${queueNameConst}, type ${names.pascal}SyncJobData } from './${names.kebab}.job';
import { ${clockToken} } from '../${names.kebab}.tokens';
import { Inject } from '@nestjs/common';

@Injectable()
export class ${jobsClass} {
  constructor(
    private readonly queue: QueueProducer,
    @Inject(${clockToken}) private readonly clock: Clock,
  ) {}

  async enqueueSync(resourceId: string): Promise<boolean> {
    if (!this.queue.isEnabled()) return false;

    const data: ${names.pascal}SyncJobData = {
      resourceId,
      enqueuedAt: this.clock.now().toISOString(),
    };

    await this.queue.enqueue(${queueNameConst}, ${queueJobConst}, data, {
      jobId: \`\${${queueJobConst}}:\${resourceId}\`,
    });
    return true;
  }
}
`,
      },
    );
  }

  return files;
}

function writeScaffoldFiles(
  files: ScaffoldFile[],
  options: Pick<CliOptions, 'dryRun' | 'force'>,
): void {
  for (const file of files) {
    if (options.dryRun) {
      process.stdout.write(`[dry-run] ${file.path}\n`);
      continue;
    }
    writeFile(file.path, file.content, options.force);
    process.stdout.write(`[created] ${file.path}\n`);
  }
}

function main(): void {
  try {
    const options = parseArgs(process.argv.slice(2));
    const names = buildFeatureNames(options.name);
    const files = buildFiles(names, options.withQueue);

    process.stdout.write(
      `Scaffolding feature "${names.kebab}"${options.withQueue ? ' (with queue)' : ''}${options.dryRun ? ' [dry-run]' : ''}\n`,
    );

    writeScaffoldFiles(files, options);

    if (options.dryRun) {
      process.stdout.write('Dry-run completed. No files were written.\n');
    } else {
      process.stdout.write(
        `Done. Next steps:\n- add ${names.pascal}Module to apps/api/src/app.module.ts\n- replace TODO tests in generated spec files\n`,
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    if (!message.includes('Usage:')) {
      process.stderr.write(`${usage()}\n`);
    }
    process.exit(1);
  }
}

main();
