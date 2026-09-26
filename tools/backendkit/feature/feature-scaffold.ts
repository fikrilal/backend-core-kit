import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { TextOutput } from '../verification/run-profile';

export type ScaffoldTier = 'simple' | 'clean';

export type ScaffoldFeatureOptions = Readonly<{
  name: string;
  tier?: ScaffoldTier;
  withQueue?: boolean;
  dryRun?: boolean;
  force?: boolean;
}>;

export type FeatureNames = Readonly<{
  kebab: string;
  pascal: string;
  camel: string;
  upperSnake: string;
}>;

export type ScaffoldFile = Readonly<{
  path: string;
  content: string;
}>;

export type ScaffoldFeatureResult = Readonly<{
  featureName: string;
  tier: ScaffoldTier;
  withQueue: boolean;
  dryRun: boolean;
  files: ReadonlyArray<ScaffoldFile>;
  modulePath: string;
  nextSteps: ReadonlyArray<string>;
}>;

export function normalizeFeatureName(raw: string): string {
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

export function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function toCamelCase(kebab: string): string {
  const pascal = toPascalCase(kebab);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function toUpperSnake(kebab: string): string {
  return kebab.replace(/-/g, '_').toUpperCase();
}

export function buildFeatureNames(inputName: string): FeatureNames {
  const kebab = normalizeFeatureName(inputName);
  return {
    kebab,
    pascal: toPascalCase(kebab),
    camel: toCamelCase(kebab),
    upperSnake: toUpperSnake(kebab),
  };
}

function buildQueueFiles(names: FeatureNames, options: { clean: boolean }): ScaffoldFile[] {
  const base = join('libs', 'features', names.kebab);
  const jobsDir = options.clean ? join(base, 'infra', 'jobs') : join(base, 'jobs');
  const platformPrefix = options.clean ? '../../../../platform' : '../../../platform';
  const sharedPrefix = options.clean ? '../../../../shared' : '../../../shared';
  const tokenImport = options.clean ? `../${names.kebab}.tokens` : `../${names.kebab}.tokens`;
  const jobsClass = `${names.pascal}Jobs`;
  const queueNameConst = `${names.upperSnake}_QUEUE`;
  const queueJobConst = `${names.upperSnake}_SYNC_JOB`;

  return [
    {
      path: join(jobsDir, `${names.kebab}.job.ts`),
      content: `import { jobName, queueName, type JsonObject } from '${platformPrefix}/queue/queue.types';

export const ${queueNameConst} = queueName('${names.kebab}');
export const ${queueJobConst} = jobName('${names.camel}.sync');

export type ${names.pascal}SyncJobData = Readonly<{
  resourceId: string;
  enqueuedAt: string;
}> &
  JsonObject;

export function ${names.camel}SyncJobId(resourceId: string): string {
  // BullMQ job ids cannot contain ":".
  return '${names.camel}.sync-' + resourceId;
}
`,
    },
    {
      path: join(jobsDir, `${names.kebab}.jobs.ts`),
      content: `import { Inject, Injectable } from '@nestjs/common';
import { QueueProducer } from '${platformPrefix}/queue/queue.producer';
import type { Clock } from '${sharedPrefix}/time';
import {
  ${queueJobConst},
  ${queueNameConst},
  ${names.camel}SyncJobId,
  type ${names.pascal}SyncJobData,
} from './${names.kebab}.job';
import { ${names.upperSnake}_CLOCK } from '${tokenImport}';

@Injectable()
export class ${jobsClass} {
  constructor(
    private readonly queue: QueueProducer,
    @Inject(${names.upperSnake}_CLOCK) private readonly clock: Clock,
  ) {}

  async enqueueSync(resourceId: string): Promise<boolean> {
    if (!this.queue.isEnabled()) return false;

    const data: ${names.pascal}SyncJobData = {
      resourceId,
      enqueuedAt: this.clock.now().toISOString(),
    };

    await this.queue.enqueue(${queueNameConst}, ${queueJobConst}, data, {
      jobId: ${names.camel}SyncJobId(resourceId),
    });
    return true;
  }
}
`,
    },
  ];
}

function buildSimpleFiles(names: FeatureNames, withQueue: boolean): ScaffoldFile[] {
  const base = join('libs', 'features', names.kebab);
  const serviceClass = `${names.pascal}Service`;
  const repositoryClass = `Prisma${names.pascal}Repository`;
  const moduleClass = `${names.pascal}Module`;
  const controllerClass = `${names.pascal}Controller`;
  const dtoClass = `${names.pascal}HealthDto`;
  const jobsClass = `${names.pascal}Jobs`;

  const files: ScaffoldFile[] = [
    {
      path: join(base, `${names.kebab}.tokens.ts`),
      content: `export const ${names.upperSnake}_CLOCK = Symbol('${names.upperSnake}_CLOCK');
`,
    },
    {
      path: join(base, `${names.kebab}.dto.ts`),
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
      path: join(base, `prisma-${names.kebab}.repository.ts`),
      content: `import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/db/prisma.service';

@Injectable()
export class ${repositoryClass} {
  constructor(private readonly prisma: PrismaService) {}

  async ping(): Promise<void> {
    await this.prisma.getClient().$queryRaw\`SELECT 1\`;
  }
}
`,
    },
    {
      path: join(base, `${names.kebab}.service.ts`),
      content: `import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '../../shared/time';
import { ${names.upperSnake}_CLOCK } from './${names.kebab}.tokens';
import { ${repositoryClass} } from './prisma-${names.kebab}.repository';

@Injectable()
export class ${serviceClass} {
  constructor(
    private readonly repo: ${repositoryClass},
    @Inject(${names.upperSnake}_CLOCK) private readonly clock: Clock,
  ) {}

  async healthCheck(): Promise<Readonly<{ status: 'ok'; now: string }>> {
    await this.repo.ping();
    return { status: 'ok', now: this.clock.now().toISOString() };
  }
}
`,
    },
    {
      path: join(base, `${names.kebab}.controller.ts`),
      content: `import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../platform/http/openapi/api-error-codes.decorator';
import { ${dtoClass} } from './${names.kebab}.dto';
import { ${serviceClass} } from './${names.kebab}.service';

@ApiTags('${names.pascal}')
@Controller('${names.kebab}')
export class ${controllerClass} {
  constructor(private readonly service: ${serviceClass}) {}

  @Get('health')
  @ApiOperation({
    operationId: '${names.kebab}.health.get',
    summary: 'Health check',
    description: 'Minimal endpoint-slice scaffold for the ${names.kebab} feature.',
  })
  @ApiErrorCodes([ErrorCode.INTERNAL])
  @ApiOkResponse({ type: ${dtoClass} })
  async health(): Promise<${dtoClass}> {
    return await this.service.healthCheck();
  }
}
`,
    },
    {
      path: join(base, `${names.kebab}.module.ts`),
      content: `import { Module } from '@nestjs/common';
import { PrismaModule } from '../../platform/db/prisma.module';
${withQueue ? "import { QueueModule } from '../../platform/queue/queue.module';\n" : ''}import { provideSystemClockToken } from '../../platform/di/app-service.provider';
import { ${controllerClass} } from './${names.kebab}.controller';
${withQueue ? `import { ${jobsClass} } from './jobs/${names.kebab}.jobs';\n` : ''}import { ${serviceClass} } from './${names.kebab}.service';
import { ${names.upperSnake}_CLOCK } from './${names.kebab}.tokens';
import { ${repositoryClass} } from './prisma-${names.kebab}.repository';

@Module({
  imports: [
    PrismaModule,
${withQueue ? '    QueueModule,\n' : ''}  ],
  controllers: [${controllerClass}],
  providers: [
    ${repositoryClass},
${withQueue ? `    ${jobsClass},\n` : ''}    provideSystemClockToken(${names.upperSnake}_CLOCK),
    ${serviceClass},
  ],
  exports: [${serviceClass}],
})
export class ${moduleClass} {}
`,
    },
    {
      path: join(base, `${names.kebab}.service.spec.ts`),
      content: `describe('${serviceClass}', () => {
  it.todo('returns deterministic health check values');
  it.todo('propagates repository failures when needed');
});
`,
    },
    {
      path: join(base, `prisma-${names.kebab}.repository.spec.ts`),
      content: `describe('${repositoryClass}', () => {
  it.todo('implements ping against Prisma');
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

  if (withQueue) files.push(...buildQueueFiles(names, { clean: false }));
  return files;
}

function buildCleanFiles(names: FeatureNames, withQueue: boolean): ScaffoldFile[] {
  const base = join('libs', 'features', names.kebab);
  const serviceClass = `${names.pascal}Service`;
  const repositoryInterface = `${names.pascal}Repository`;
  const repositoryClass = `Prisma${names.pascal}Repository`;
  const moduleClass = `${names.pascal}Module`;
  const controllerClass = `${names.pascal}Controller`;
  const dtoClass = `${names.pascal}HealthDto`;
  const jobsClass = `${names.pascal}Jobs`;

  const files: ScaffoldFile[] = [
    {
      path: join(base, 'app', 'ports', `${names.kebab}.repository.ts`),
      content: `export interface ${repositoryInterface} {
  ping(): Promise<void>;
}
`,
    },
    {
      path: join(base, 'app', `${names.kebab}.service.ts`),
      content: `import type { Clock } from '../../../shared/time';
import type { ${repositoryInterface} } from './ports/${names.kebab}.repository';

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
      content: `export const ${names.upperSnake}_CLOCK = Symbol('${names.upperSnake}_CLOCK');
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
      path: join(base, 'infra', 'http', `${names.kebab}.controller.ts`),
      content: `import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { ${serviceClass} } from '../../app/${names.kebab}.service';
import { ${dtoClass} } from './dtos/${names.kebab}.dto';

@ApiTags('${names.pascal}')
@Controller('${names.kebab}')
export class ${controllerClass} {
  constructor(private readonly service: ${serviceClass}) {}

  @Get('health')
  @ApiOperation({
    operationId: '${names.kebab}.health.get',
    summary: 'Health check',
    description: 'Minimal clean-slice scaffold for the ${names.kebab} feature.',
  })
  @ApiErrorCodes([ErrorCode.INTERNAL])
  @ApiOkResponse({ type: ${dtoClass} })
  async health(): Promise<${dtoClass}> {
    return await this.service.healthCheck();
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
${withQueue ? `import { ${jobsClass} } from './jobs/${names.kebab}.jobs';\n` : ''}import { ${repositoryClass} } from './persistence/prisma-${names.kebab}.repository';
import { ${names.upperSnake}_CLOCK } from './${names.kebab}.tokens';

@Module({
  imports: [
    PrismaModule,
${withQueue ? '    QueueModule,\n' : ''}  ],
  controllers: [${controllerClass}],
  providers: [
    ${repositoryClass},
${withQueue ? `    ${jobsClass},\n` : ''}    provideSystemClockToken(${names.upperSnake}_CLOCK),
    provideConstructedAppService({
      provide: ${serviceClass},
      inject: [${repositoryClass}, ${names.upperSnake}_CLOCK],
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
      content: `describe('${serviceClass}', () => {
  it.todo('returns deterministic health check values');
  it.todo('propagates repository failures when needed');
});
`,
    },
    {
      path: join(base, 'infra', 'persistence', `prisma-${names.kebab}.repository.spec.ts`),
      content: `describe('${repositoryClass}', () => {
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

  if (withQueue) files.push(...buildQueueFiles(names, { clean: true }));
  return files;
}

export function buildScaffoldFiles(options: {
  name: string;
  tier: ScaffoldTier;
  withQueue: boolean;
}): ScaffoldFile[] {
  const names = buildFeatureNames(options.name);
  if (options.tier === 'clean') return buildCleanFiles(names, options.withQueue);
  return buildSimpleFiles(names, options.withQueue);
}

export async function runFeatureScaffold(
  options: ScaffoldFeatureOptions,
  rootDir: string = process.cwd(),
  output?: TextOutput,
): Promise<ScaffoldFeatureResult> {
  const tier = options.tier ?? 'simple';
  const withQueue = Boolean(options.withQueue);
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  const names = buildFeatureNames(options.name);

  const files = buildScaffoldFiles({ name: names.kebab, tier, withQueue });

  if (output) {
    output.write(
      `Scaffolding feature "${names.kebab}" (${tier})${withQueue ? ' with queue' : ''}${dryRun ? ' [dry-run]' : ''}\n`,
    );
  }

  for (const file of files) {
    const fullPath = resolve(rootDir, file.path);
    if (dryRun) {
      if (output) output.write(`[dry-run] ${file.path}\n`);
      continue;
    }

    const fileExists = await readFile(fullPath)
      .then(() => true)
      .catch(() => false);

    if (fileExists && !force) {
      throw new Error(`File already exists: ${file.path} (pass --force to overwrite)`);
    }

    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.content, 'utf8');
    if (output) output.write(`[created] ${file.path}\n`);
  }

  const modulePath =
    tier === 'clean'
      ? `libs/features/${names.kebab}/infra/${names.kebab}.module.ts`
      : `libs/features/${names.kebab}/${names.kebab}.module.ts`;

  const nextSteps = [
    `add ${names.pascal}Module from ${modulePath} to apps/api/src/app.module.ts when exposing it`,
    'replace TODO tests in generated spec files',
  ];

  if (output) {
    if (dryRun) {
      output.write('Dry-run completed. No files were written.\n');
    } else {
      output.write(`Done. Next steps:\n- ${nextSteps.join('\n- ')}\n`);
    }
  }

  return {
    featureName: names.kebab,
    tier,
    withQueue,
    dryRun,
    files,
    modulePath,
    nextSteps,
  };
}
