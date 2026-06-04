import 'reflect-metadata';

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse } from 'dotenv';
import ts from 'typescript';
import { validateEnv } from '../libs/platform/config/env.validation';

type EnvExampleCheckResult = Readonly<{
  assignmentKeys: ReadonlyArray<string>;
  schemaKeys: ReadonlyArray<string>;
}>;

const ENV_EXAMPLE_PATH = 'env.example';
const CONFIG_SCHEMA_DIR = 'libs/platform/config';

const REQUIRED_DOCUMENTED_KEYS = [
  'NODE_ENV',
  'HTTP_TRUST_PROXY',
  'DATABASE_URL',
  'REDIS_URL',
  'AUTH_ISSUER',
  'AUTH_AUDIENCE',
  'OTEL_SERVICE_NAME',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
] as const;

const PRODUCTION_INVARIANT_OVERRIDES: Readonly<Record<string, string>> = {
  NODE_ENV: 'production',
  HTTP_TRUST_PROXY: 'true',
  DATABASE_URL: 'postgresql://postgres@example.com:5432/backend_core_kit?schema=public',
  REDIS_URL: 'redis://example.com:6379/0',
  AUTH_ISSUER: 'https://api.example.com',
  AUTH_AUDIENCE: 'api.example.com',
  OTEL_SERVICE_NAME: 'backend-core-kit',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example.com',
};

function lineLooksLikeAssignment(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return true;
  return /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=/.test(trimmed);
}

function extractAssignmentKey(line: string): string | undefined {
  const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line.trim());
  return match?.[1];
}

function assertDotenvSyntax(content: string): ReadonlyArray<string> {
  const errors: string[] = [];
  const seen = new Map<string, number>();
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (!lineLooksLikeAssignment(line)) {
      errors.push(`Line ${lineNumber} is not a valid dotenv assignment or comment`);
      return;
    }

    const key = extractAssignmentKey(line);
    if (!key) return;

    const firstSeen = seen.get(key);
    if (firstSeen !== undefined) {
      errors.push(
        `Duplicate key ${key} on line ${lineNumber} (first defined on line ${firstSeen})`,
      );
      return;
    }
    seen.set(key, lineNumber);
  });

  return errors;
}

function collectSchemaKeysFromSource(filePath: string, sourceText: string): ReadonlyArray<string> {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const keys = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      if (/^[A-Z][A-Z0-9_]*$/.test(name)) {
        keys.add(name);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...keys].sort((a, b) => a.localeCompare(b));
}

async function collectSchemaKeys(): Promise<ReadonlyArray<string>> {
  const keys = new Set<string>();
  const schemaDir = resolve(process.cwd(), CONFIG_SCHEMA_DIR);
  const entries = await readdir(schemaDir, { withFileTypes: true });
  const schemaFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /^env\.schema(?:\.[A-Za-z0-9_-]+)?\.ts$/.test(name))
    .sort((a, b) => a.localeCompare(b));

  for (const fileName of schemaFiles) {
    const path = join(CONFIG_SCHEMA_DIR, fileName);
    const abs = join(schemaDir, fileName);
    const content = await readFile(abs, 'utf8');
    for (const key of collectSchemaKeysFromSource(path, content)) {
      keys.add(key);
    }
  }

  return [...keys].sort((a, b) => a.localeCompare(b));
}

function assertNoStaleKeys(
  assignmentKeys: ReadonlyArray<string>,
  schemaKeys: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const schema = new Set(schemaKeys);
  return assignmentKeys
    .filter((key) => !schema.has(key))
    .map((key) => `env.example defines ${key}, but EnvVars has no matching schema property`);
}

function assertRequiredKeysDocumented(
  assignmentKeys: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const documented = new Set(assignmentKeys);
  return REQUIRED_DOCUMENTED_KEYS.filter((key) => !documented.has(key)).map(
    (key) => `env.example is missing required documented key ${key}`,
  );
}

async function checkEnvExample(): Promise<EnvExampleCheckResult> {
  const envPath = resolve(process.cwd(), ENV_EXAMPLE_PATH);
  const content = await readFile(envPath, 'utf8');
  const syntaxErrors = assertDotenvSyntax(content);
  if (syntaxErrors.length > 0) {
    throw new Error(`Invalid ${ENV_EXAMPLE_PATH} syntax:\n- ${syntaxErrors.join('\n- ')}`);
  }

  const parsed = parse(content);
  const assignmentKeys = Object.keys(parsed).sort((a, b) => a.localeCompare(b));
  const schemaKeys = await collectSchemaKeys();

  const errors = [
    ...assertNoStaleKeys(assignmentKeys, schemaKeys),
    ...assertRequiredKeysDocumented(assignmentKeys),
  ];

  try {
    validateEnv(parsed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`${ENV_EXAMPLE_PATH} does not satisfy EnvVars schema: ${message}`);
  }

  try {
    validateEnv({ ...parsed, ...PRODUCTION_INVARIANT_OVERRIDES });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`${ENV_EXAMPLE_PATH} production-like invariant check failed: ${message}`);
  }

  if (errors.length > 0) {
    throw new Error(`Environment example verification failed:\n- ${errors.join('\n- ')}`);
  }

  return { assignmentKeys, schemaKeys };
}

checkEnvExample()
  .then((result) => {
    process.stdout.write(
      [
        'Environment example verification completed',
        `- file: ${ENV_EXAMPLE_PATH}`,
        `- documented keys: ${result.assignmentKeys.length}`,
        `- schema keys: ${result.schemaKeys.length}`,
      ].join('\n') + '\n',
    );
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
